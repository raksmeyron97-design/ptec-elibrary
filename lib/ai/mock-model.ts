// lib/ai/mock-model.ts
// A deterministic stand-in for the language model, for end-to-end tests.
// Server-only, and reachable ONLY when AI_MOCK_PROVIDER is set.
//
// Why this exists. CI's e2e job boots a real Supabase stack but has no Gemini
// key, so every model call throws `unavailable` and not one of the assistant's
// surfaces — the widget, sources, citations, the quota badge — was reachable
// by a browser test. Locally the same suite would hit the real, billed API.
// Both are bad in different directions, and the result was the same: zero e2e
// coverage of the feature this phase is about.
//
// The mock is not a chatbot. It answers from the LIBRARY DATA block it was
// given, quoting the first passage and citing it in exactly the form
// `enforceGrounding` verifies. That makes the tests assert something real:
// if the context builder stops labelling passages, or grounding starts
// stripping valid citations, the mock's answer stops matching and the test
// fails. An answer it invents would be stripped by grounding like any other
// model's, because the mock is on the same side of that check.

import "server-only";

import { MockLanguageModelV3 } from "ai/test";
import type { LanguageModel } from "ai";

/** True when the assistant must not reach a real provider. */
export function isMockProvider(): boolean {
  return process.env.AI_MOCK_PROVIDER === "1" || process.env.AI_MOCK_PROVIDER === "true";
}

/** `[1] "Title" (Author), p. 42: text` — what lib/ai/context.ts emits. */
const PASSAGE_RE = /^\[\d+\]\s+"([^"]+)"\s+\(([^)]*)\),\s*p\.\s*(\d+):\s*([\s\S]*)$/;

type Passage = { title: string; page: number; text: string };

function passagesFrom(prompt: string): Passage[] {
  const out: Passage[] = [];
  for (const line of prompt.split("\n")) {
    const m = PASSAGE_RE.exec(line.trim());
    if (m) out.push({ title: m[1], page: Number(m[3]), text: m[4].trim() });
  }
  return out;
}

function textOf(options: { prompt: unknown }): string {
  const parts: string[] = [];
  for (const message of (options.prompt as { content?: unknown }[]) ?? []) {
    const content = message?.content;
    if (typeof content === "string") parts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (part && typeof part === "object" && "text" in part) parts.push(String((part as { text: unknown }).text));
      }
    }
  }
  return parts.join("\n");
}

/**
 * An answer built strictly from the evidence in the prompt.
 *
 * With no passages it says so plainly, which is the same thing the
 * deterministic templates say and the same thing a real model is instructed
 * to say — so a test for the no-evidence path tests the contract, not the
 * mock's manners.
 */
export function mockAnswerFor(prompt: string): string {
  const passages = passagesFrom(prompt);
  if (passages.length === 0) {
    return "I could not find evidence for that in the PTEC Library.";
  }
  const cited = passages
    .slice(0, 2)
    .map((p) => `${p.text.slice(0, 160)} (${p.title}, p. ${p.page})`)
    .join(" ");
  return `According to the retrieved PTEC Library materials: ${cited}`;
}

export function mockModel(): LanguageModel {
  const doGenerate = async (options: { prompt: unknown }) => {
    const prompt = textOf(options);
    const answer = mockAnswerFor(prompt);
    return {
      content: [{ type: "text" as const, text: answer }],
      finishReason: "stop" as const,
      usage: {
        inputTokens: Math.round(prompt.length / 4),
        outputTokens: Math.round(answer.length / 4),
        totalTokens: Math.round((prompt.length + answer.length) / 4),
      },
      warnings: [] as [],
    };
  };
  // The SDK's own mock, with its call-options type erased: this module only
  // reads the prompt, and pinning the full LanguageModelV3 signature here
  // would make a provider-version bump a compile error in application code.
  return new MockLanguageModelV3({ doGenerate } as never) as unknown as LanguageModel;
}
