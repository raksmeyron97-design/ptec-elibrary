// app/api/chat/route.ts
// PTEC Library AI assistant (streaming, RAG over books + research).
// Hardened to mirror /api/ask: auth-gated, per-user daily quota, global
// circuit breaker, cooldown, sanitized search, and generic error responses.
// GEMINI_API_KEY is read from the environment only — never from disk.

import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { AppRole } from "@/lib/types/roles";
import { ADMIN_PANEL_ROLES } from "@/lib/types/roles";
import { streamText, convertToModelMessages, type UIMessage } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

// ── Cost-control constants (kept in step with /api/ask) ─────────────────────────
const DAILY_USER_LIMIT = 10; // per-user messages/day (Asia/Phnom_Penh date)
const DAILY_GLOBAL_LIMIT = 500; // total messages/day across all users
const COOLDOWN_MS = 5_000; // min ms between accepted requests per user
const MAX_OUTPUT_TOKENS = 700; // hard cap on model response length
const MAX_TURNS = 10; // max conversation turns accepted from the client
const MAX_TEXT_LEN = 500; // max chars per message

const MODEL = "gemini-3.5-flash";

// Sentinel UUID for the global circuit breaker row in ai_usage (not a real user).
const GLOBAL_SENTINEL = "00000000-0000-0000-0000-000000000000";

// In-memory per-user cooldown (resets on cold start — daily quota lives in the DB).
const cooldownMap = new Map<string, number>();

// Strip PostgREST filter metacharacters so user input can't break out of the
// `.or(...)` filter string (comma/paren/percent/backslash/asterisk).
function sanitizeSearchTerm(input: string): string {
  return input
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function lastUserText(messages: UIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    const parts = Array.isArray(m.parts) ? m.parts : [];
    return parts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((p: any) => p?.type === "text" && typeof p.text === "string")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((p: any) => p.text as string)
      .join("");
  }
  return "";
}

export async function POST(req: Request) {
  // ── 1. Auth ───────────────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: "auth" }, { status: 401 });
  }
  const userId = user.id;

  // ── 2. Body validation ─────────────────────────────────────────────────────────
  let body: { messages?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array." }, { status: 400 });
  }
  if (body.messages.length > MAX_TURNS) {
    return Response.json({ error: `messages array exceeds ${MAX_TURNS} turns.` }, { status: 400 });
  }

  const messages = body.messages as UIMessage[];
  const query = sanitizeSearchTerm(lastUserText(messages));
  if (!query) {
    return Response.json({ error: "Empty message." }, { status: 400 });
  }
  if (query.length > MAX_TEXT_LEN) {
    return Response.json({ error: "Message too long." }, { status: 400 });
  }

  // ── 3. Cooldown (in-memory, per-user) ────────────────────────────────────────────
  const now = Date.now();
  if (now - (cooldownMap.get(userId) ?? 0) < COOLDOWN_MS) {
    return Response.json({ error: "cooldown" }, { status: 429 });
  }
  cooldownMap.set(userId, now);

  // ── 4. Role check (admins skip quota) ────────────────────────────────────────────
  const db = createServiceClient();
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();
  const isAdmin = ADMIN_PANEL_ROLES.includes((profile?.role ?? "reader") as AppRole);

  // ── 5. Per-user daily quota ──────────────────────────────────────────────────────
  if (!isAdmin) {
    const { data: quota, error: quotaErr } = await db.rpc("increment_ai_usage", {
      p_user_id: userId,
      p_limit: DAILY_USER_LIMIT,
    });
    if (quotaErr) {
      console.error("[/api/chat] quota RPC error:", quotaErr.message ?? quotaErr);
      return Response.json({ error: "db_error" }, { status: 503 });
    }
    if ((quota as number) === -1) {
      return Response.json({ error: "quota" }, { status: 429 });
    }
  }

  // ── 6. Global daily circuit breaker ──────────────────────────────────────────────
  const { data: globalResult, error: globalErr } = await db.rpc("increment_ai_usage", {
    p_user_id: GLOBAL_SENTINEL,
    p_limit: DAILY_GLOBAL_LIMIT,
  });
  if (globalErr) {
    console.error("[/api/chat] global RPC error:", globalErr.message ?? globalErr);
    return Response.json({ error: "db_error" }, { status: 503 });
  }
  if ((globalResult as number) === -1) {
    return Response.json({ error: "global_limit" }, { status: 503 });
  }

  // ── 7. RAG search (anon client → RLS restricts to published rows) ─────────────────
  const { data: books } = await supabase
    .from("books")
    .select("title, author:authors(name), description, departments(name)")
    .eq("is_published", true)
    .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
    .limit(3);

  const { data: research } = await supabase
    .from("research_reports")
    .select("title, abstract, author_names, departments(name)")
    .or(`title.ilike.%${query}%,abstract.ilike.%${query}%`)
    .limit(2);

  const libraryContext = `
Library Search Results for "${query}":
Books: ${JSON.stringify(books ?? [])}
Research: ${JSON.stringify(research ?? [])}
`;

  // ── 8. Stream the model response ─────────────────────────────────────────────────
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    console.error("[/api/chat] GEMINI_API_KEY is not configured.");
    return Response.json({ error: "unavailable" }, { status: 503 });
  }

  try {
    const google = createGoogleGenerativeAI({ apiKey });
    const result = streamText({
      model: google(MODEL),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      system: `You are a helpful, polite, and knowledgeable library assistant for the PTEC E-Library (Phnom Penh Teacher Education College).
You MUST ONLY recommend books or research materials that actually exist in the library context provided below.
If no results are found in the context, tell the user politely that you couldn't find any related materials in the library.
If results are found, summarize them nicely with their title, author, and description.
Do NOT write essays, homework, or assignments for students; politely decline such requests.
Keep responses concise. Reply in Khmer (ភាសាខ្មែរ) when the user writes in Khmer, otherwise reply in English.

${libraryContext}`,
      messages: await convertToModelMessages(messages),
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    console.error("[/api/chat] stream error:", err);
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
