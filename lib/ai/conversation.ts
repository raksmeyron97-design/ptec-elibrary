// lib/ai/conversation.ts
// Conversation compression. Pure.
//
// The pre-2.0 routes resent up to 10 full turns on every request, and
// /api/ask resent the accumulated transcript once per tool-loop iteration
// (audit §4.2, §4.9). This module keeps the current question plus the minimum
// prior context that actually changes the answer, under a hard token budget.

import { MAX_HISTORY_TOKENS, clampToTokens, estimateTokens } from "./token-budget";
import type { InboundMessage } from "./guardrails";

export interface CompressedConversation {
  /** The question being answered right now. */
  current: string;
  /** Prior turns to replay, oldest first. Already within budget. */
  history: InboundMessage[];
  /** One-line state carried from turns that were dropped, or "". */
  summary: string;
  /** Estimated tokens of `history` + `summary`. */
  overheadTokens: number;
}

/** Newest user text, or "" when there is none. */
export function currentUserText(messages: readonly InboundMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].text.trim();
  }
  return "";
}

/**
 * True when the newest question can only be understood against the previous
 * turn — a pronoun, an ordinal, or a bare fragment. Anything else is treated
 * as a fresh question and carries NO history at all, which is the common case
 * and the cheapest one.
 */
export function needsHistory(current: string): boolean {
  const t = current.toLowerCase().trim();
  if (t.length <= 25) return true;
  return [
    /\b(it|that one|this one|those|them|the second|the third|the first|the last)\b/,
    /\b(what about|how about|and (also|the)|more like|another|others)\b/,
    /^(yes|no|ok|sure|why|why not|and)\b/,
    /(នេះ|នោះ|ទីពីរ|ទីមួយ|ទីបី|មួយទៀត|ចុះ|ដូចនេះ)/u,
  ].some((re) => re.test(t));
}

/**
 * Keep the current question, plus — only when the question actually depends on
 * it — the most recent exchange, trimmed to a token budget. Older turns are
 * reduced to a one-line rolling summary of what was asked, which costs ~20
 * tokens instead of several hundred.
 */
export function compressConversation(
  messages: readonly InboundMessage[],
  budget = MAX_HISTORY_TOKENS,
): CompressedConversation {
  const current = currentUserText(messages);
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") { lastUserIdx = i; break; }
  }
  const prior = lastUserIdx <= 0 ? [] : messages.slice(0, lastUserIdx);

  if (prior.length === 0 || !needsHistory(current)) {
    return { current, history: [], summary: "", overheadTokens: 0 };
  }

  // Walk backwards, newest first, taking whole turns while they fit.
  const kept: InboundMessage[] = [];
  let used = 0;
  for (let i = prior.length - 1; i >= 0; i--) {
    const m = prior[i];
    // Assistant turns are the expensive ones and are rarely needed verbatim —
    // clamp them harder than the user's own words.
    const text = m.role === "model" ? clampToTokens(m.text, 120) : m.text;
    const cost = estimateTokens(text);
    if (used + cost > budget) break;
    used += cost;
    kept.unshift({ role: m.role, text });
  }

  const dropped = prior.slice(0, prior.length - kept.length).filter((m) => m.role === "user");
  const summary = dropped.length
    ? clampToTokens(`Earlier in this conversation the reader asked about: ${dropped
        .map((m) => m.text.replace(/\s+/g, " ").trim())
        .join("; ")}.`, 60)
    : "";

  return {
    current,
    history: kept,
    summary,
    overheadTokens: used + estimateTokens(summary),
  };
}
