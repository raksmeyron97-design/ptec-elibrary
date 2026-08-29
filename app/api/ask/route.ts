// app/api/ask/route.ts
// COMPATIBILITY ADAPTER over the canonical AI service (app/api/ai + lib/ai).
//
// AskWidget posts { messages: [{role,text}] } and reads
// { answer, books, remaining } — that contract is unchanged, so the widget
// needed no edits. Everything behind it moved: the 700-token system prompt,
// the six tool declarations, the up-to-four-call Gemini tool loop, the
// duplicated quota/cooldown constants and the text-embedding-004 search that
// queried a gemini-embedding-001 column are all gone (see
// docs/AI_ASSISTANT_AUDIT.md §2.1, §3, §4).
//
// New clients should call /api/ai, which returns the richer typed AIResponse
// (mode, intent, sources, metadata).

import { createClient } from "@/lib/supabase/server";
import { AIRequestError, isDuplicateTurn, validateMessages, type AILocale } from "@/lib/ai";
import { checkCooldown, consumeQuota } from "@/lib/ai/limits";
import { runAssistant } from "@/lib/ai/router";
import { recordAiRequest } from "@/lib/ai/telemetry";
import { lockdownResponse } from "@/lib/security/lockdown";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Legacy result-card shape. `AIResponse.results` is a superset of it. */
interface LegacyBook {
  slug: string;
  title: string;
  author: string;
  coverUrl: string | null;
  url: string;
  type: string;
}

export async function POST(req: Request) {
  const locked = lockdownResponse("ai", "/api/ask");
  if (locked) return locked;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });

  let body: { messages?: unknown; locale?: string; context?: { slug?: string } };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const validated = validateMessages(body.messages);
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });
  if (isDuplicateTurn(validated.messages)) {
    return Response.json({ error: "duplicate" }, { status: 400 });
  }

  if (!checkCooldown(user.id)) return Response.json({ error: "cooldown" }, { status: 429 });

  let remaining: number | null = null;
  try {
    ({ remaining } = await consumeQuota(user.id));
  } catch (err) {
    if (err instanceof AIRequestError) {
      if (err.code === "quota") {
        recordAiRequest("/api/ask", "quota", { intent: "unsupported" });
        return Response.json({ error: "quota", remaining: 0 }, { status: 429 });
      }
      return err.toResponse();
    }
    throw err;
  }

  const locale = body.locale === "km" || body.locale === "en" ? (body.locale as AILocale) : undefined;

  try {
    const { response, telemetry } = await runAssistant({
      messages: validated.messages,
      locale,
      context: { slug: typeof body.context?.slug === "string" ? body.context.slug : undefined },
      remaining,
    });
    recordAiRequest("/api/ask", telemetry.fallback === "error" ? "fallback" : "ok", telemetry);

    const books: LegacyBook[] = (response.results ?? []).slice(0, 5);
    return Response.json({ answer: response.answer, books, remaining });
  } catch (err) {
    if (err instanceof AIRequestError) return err.toResponse();
    console.error("[/api/ask] failed:", err);
    recordAiRequest("/api/ask", "error", { intent: "general_knowledge" });
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
