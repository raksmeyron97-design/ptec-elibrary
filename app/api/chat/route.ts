// app/api/chat/route.ts
// COMPATIBILITY ADAPTER over the canonical AI service (app/api/ai + lib/ai).
//
// Speaks the AI-SDK `useChat` protocol: it takes `UIMessage[]` and returns a
// UI message stream. That is the only thing this file knows how to do —
// retrieval, prompting, budgets, grounding and cost control all live in
// lib/ai/*, shared with /api/ai and /api/ask.
//
// NOTE: as of the 2.0 rework this endpoint has no first-party caller —
// components/ui/chat/FloatingChat.tsx is not mounted anywhere (audit §5). It is
// kept working, and kept behind the same auth + quota gate, so that any client
// still pointed at it does not break; it is the first thing to delete once
// that is confirmed.

import { createClient } from "@/lib/supabase/server";
import type { UIMessage } from "ai";
import { AIRequestError, validateMessages, type AILocale } from "@/lib/ai";
import { checkCooldown, consumeQuota } from "@/lib/ai/limits";
import { runAssistant, streamAssistant } from "@/lib/ai/router";
import { recordAiRequest } from "@/lib/ai/telemetry";
import { enforceGrounding } from "@/lib/ai/guardrails";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Flatten the AI-SDK UI message shape into the core's `{role,text}` wire. */
function toInbound(messages: UIMessage[]): Array<{ role: "user" | "model"; text: string }> {
  return messages
    .map((m) => {
      const parts = Array.isArray(m.parts) ? m.parts : [];
      const text = parts
        .filter((p): p is { type: "text"; text: string } => p?.type === "text" && typeof (p as { text?: unknown }).text === "string")
        .map((p) => p.text)
        .join("")
        .trim();
      return { role: m.role === "user" ? ("user" as const) : ("model" as const), text };
    })
    .filter((m) => m.text.length > 0)
    // The core caps message length; oversized turns are truncated rather than
    // rejected here so an old client with a long transcript still works.
    .map((m) => ({ ...m, text: m.text.slice(0, 500) }));
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "auth" }, { status: 401 });

  let body: { messages?: unknown; locale?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "messages must be a non-empty array." }, { status: 400 });
  }

  // Keep the most recent turns only — the core compresses further, but this
  // bounds the work done on a hostile body.
  const inbound = toInbound(body.messages as UIMessage[]).slice(-10);
  const validated = validateMessages(inbound);
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });

  if (!checkCooldown(user.id)) return Response.json({ error: "cooldown" }, { status: 429 });

  let remaining: number | null = null;
  try {
    ({ remaining } = await consumeQuota(user.id));
  } catch (err) {
    if (err instanceof AIRequestError) {
      if (err.code === "quota") {
        recordAiRequest("/api/chat", "quota", { intent: "unsupported" });
        return Response.json({ error: "quota" }, { status: 429 });
      }
      return err.toResponse();
    }
    throw err;
  }

  const locale = body.locale === "km" || body.locale === "en" ? (body.locale as AILocale) : undefined;

  try {
    const plan = await streamAssistant({ messages: validated.messages, locale, remaining });

    if (!plan.streamed) {
      const { response, telemetry } = plan.result;
      recordAiRequest("/api/chat", "ok", telemetry);
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "0" });
          writer.write({ type: "text-delta", id: "0", delta: response.answer });
          writer.write({ type: "text-end", id: "0" });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }

    const started = Date.now();
    const { stream: result, telemetry, sources } = plan;
    void Promise.resolve(result.text)
      .then((text) => {
        const grounded = enforceGrounding(text ?? "", sources);
        recordAiRequest("/api/chat", "ok", {
          ...telemetry,
          latencyMs: telemetry.latencyMs + (Date.now() - started),
          outputTokens: Math.round((text ?? "").length / 4),
          totalTokens: telemetry.inputTokens + Math.round((text ?? "").length / 4),
          fallback: grounded.hallucinated.length ? "error" : telemetry.fallback,
        });
      })
      .catch(() => recordAiRequest("/api/chat", "error", telemetry));

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (err instanceof AIRequestError) return err.toResponse();
    console.error("[/api/chat] failed:", err);
    // Last resort: answer without streaming rather than returning nothing.
    try {
      const { response, telemetry } = await runAssistant({ messages: validated.messages, locale, remaining });
      recordAiRequest("/api/chat", "fallback", telemetry);
      const stream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "0" });
          writer.write({ type: "text-delta", id: "0", delta: response.answer });
          writer.write({ type: "text-end", id: "0" });
        },
      });
      return createUIMessageStreamResponse({ stream });
    } catch {
      recordAiRequest("/api/chat", "error", { intent: "general_knowledge" });
      return Response.json({ error: "unavailable" }, { status: 503 });
    }
  }
}
