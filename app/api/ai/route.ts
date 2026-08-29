// app/api/ai/route.ts
// The canonical AI endpoint. /api/ask and /api/chat are compatibility adapters
// over this same core (lib/ai/*) and hold no AI logic of their own.
//
// Request:
//   POST { messages: [{ role: "user"|"model", text: string }],
//          context?: { slug?, slugType?, hadResults? },
//          locale?: "en"|"km",
//          stream?: boolean }
//
// Response (stream=false): AIResponse + { remaining }
// Response (stream=true):  an AI-SDK UI message stream

import { createClient } from "@/lib/supabase/server";
import {
  AIRequestError,
  isDuplicateTurn,
  validateMessages,
  type AILocale,
} from "@/lib/ai";
import { checkCooldown, consumeQuota } from "@/lib/ai/limits";
import { runAssistant, streamAssistant } from "@/lib/ai/router";
import { recordAiRequest } from "@/lib/ai/telemetry";
import { lockdownResponse } from "@/lib/security/lockdown";
import { enforceGrounding } from "@/lib/ai/guardrails";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Body {
  messages?: unknown;
  context?: { slug?: string; slugType?: string; hadResults?: boolean };
  locale?: string;
  stream?: boolean;
}

/**
 * Shared front half of every AI request: authenticate, validate, throttle,
 * bill. Anything that can reject the request happens here, before a single
 * token of retrieval or generation is paid for.
 */
async function admit(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new AIRequestError("auth");

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    throw new AIRequestError("bad_request", "Invalid JSON body.");
  }

  const validated = validateMessages(body.messages);
  if (!validated.ok) throw new AIRequestError("bad_request", validated.error);
  // A verbatim resend is a double-submit; answering it would cost a quota unit.
  if (isDuplicateTurn(validated.messages)) throw new AIRequestError("duplicate");

  if (!checkCooldown(user.id)) throw new AIRequestError("cooldown");
  const { remaining } = await consumeQuota(user.id);

  const locale = body.locale === "km" || body.locale === "en" ? (body.locale as AILocale) : undefined;
  return {
    messages: validated.messages,
    remaining,
    locale,
    context: {
      slug: typeof body.context?.slug === "string" ? body.context.slug.slice(0, 200) : undefined,
      slugType: body.context?.slugType as "book" | "research" | "publication" | undefined,
      hadResults: body.context?.hadResults === true,
    },
    stream: body.stream === true,
  };
}

export async function POST(req: Request) {
  const locked = lockdownResponse("ai", "/api/ai");
  if (locked) return locked;

  let admitted: Awaited<ReturnType<typeof admit>>;
  try {
    admitted = await admit(req);
  } catch (err) {
    if (err instanceof AIRequestError) {
      if (err.code === "quota") {
        recordAiRequest("/api/ai", "quota", { intent: "unsupported" });
        return err.toResponse({ remaining: 0 });
      }
      return err.toResponse(err.code === "bad_request" ? { message: err.detail } : undefined);
    }
    console.error("[/api/ai] admission failed:", err);
    return new AIRequestError("unavailable").toResponse();
  }

  const { messages, remaining, locale, context, stream } = admitted;

  try {
    if (!stream) {
      const { response, telemetry } = await runAssistant({ messages, locale, context, remaining });
      recordAiRequest("/api/ai", telemetry.fallback === "error" ? "fallback" : "ok", telemetry);
      return Response.json({ ...response, remaining });
    }

    const plan = await streamAssistant({ messages, locale, context, remaining });

    if (!plan.streamed) {
      // Deterministic answer — deliver it as a one-shot UI message stream so a
      // streaming client sees the same protocol it always does.
      const { response, telemetry } = plan.result;
      recordAiRequest("/api/ai", "ok", telemetry);
      const uiStream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: "0" });
          writer.write({ type: "text-delta", id: "0", delta: response.answer });
          writer.write({ type: "text-end", id: "0" });
        },
      });
      return createUIMessageStreamResponse({ stream: uiStream });
    }

    const started = Date.now();
    const { stream: result, telemetry, sources } = plan;
    void Promise.resolve(result.text)
      .then((text) => {
        const grounded = enforceGrounding(text ?? "", sources);
        recordAiRequest("/api/ai", "ok", {
          ...telemetry,
          latencyMs: telemetry.latencyMs + (Date.now() - started),
          outputTokens: Math.max(0, Math.round((text ?? "").length / 4)),
          totalTokens: telemetry.inputTokens + Math.round((text ?? "").length / 4),
          // Recorded so a rise in ungrounded citations is visible in analytics
          // even though the streamed text itself cannot be rewritten.
          fallback: grounded.hallucinated.length ? "error" : telemetry.fallback,
        });
      })
      .catch(() => recordAiRequest("/api/ai", "error", telemetry));

    return result.toUIMessageStreamResponse();
  } catch (err) {
    if (err instanceof AIRequestError) return err.toResponse();
    console.error("[/api/ai] request failed:", err);
    recordAiRequest("/api/ai", "error", { intent: "general_knowledge" });
    return new AIRequestError("unavailable").toResponse();
  }
}
