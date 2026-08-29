// lib/ai/guardrails.ts
// Input validation, filter-string sanitization, prompt-injection defence and
// output grounding checks. Pure.
//
// One sanitizer, one validator. Before this module there were four copies of
// the PostgREST metacharacter strip across the AI and search routes, and they
// had already drifted (audit §3).

import type { Source } from "./response";

/** Max characters accepted in a single inbound message. */
export const MAX_MESSAGE_CHARS = 500;
/** Max turns accepted from the client before we reject the body outright. */
export const MAX_INBOUND_TURNS = 12;

/**
 * Strip PostgREST filter metacharacters so user (or model) text can never break
 * out of an `.or(...)` / `.ilike(...)` filter string. Comma and parenthesis are
 * the structural characters; percent and asterisk are wildcards; backslash is
 * the escape.
 */
export function sanitizeFilterTerm(input: string): string {
  return input
    .replace(/[%,()\\*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Tokens for a multi-term ilike fan-out, longest-first, deduped, capped. */
export function filterTokens(query: string, max = 6): string[] {
  const q = sanitizeFilterTerm(query);
  if (!q) return [];
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return Array.from(new Set([q, ...words])).slice(0, max);
}

/** Build a PostgREST `.or()` clause over (fields × tokens). */
export function orFilter(fields: readonly string[], tokens: readonly string[]): string {
  const clauses: string[] = [];
  for (const tok of tokens) for (const f of fields) clauses.push(`${f}.ilike.%${tok}%`);
  return clauses.join(",");
}

// ── Prompt injection ──────────────────────────────────────────────────────────
// Two directions to defend:
//   1. The user telling the assistant to drop its instructions.
//   2. Text extracted from a PDF page carrying an instruction. This one is the
//      real risk, because the pre-2.0 /api/chat concatenated retrieved corpus
//      text straight into the SYSTEM prompt, where it inherited system
//      authority (audit §6). Retrieved text now goes in a user-role message,
//      fenced and labelled as untrusted data.
const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier)\s+(instruction|prompt|rule|direction)/i,
  /disregard\s+(all\s+|the\s+)?(previous|prior|above|system)/i,
  /you\s+are\s+now\s+(a|an|the)\s+/i,
  /(reveal|print|show|repeat|output)\s+(me\s+)?(your|the)\s+(system\s+)?(prompt|instruction)/i,
  /\bdeveloper\s+mode\b/i,
  /\bDAN\s+mode\b/i,
  /<\|?(im_start|im_end|system|endoftext)\|?>/i,
  /^\s*system\s*:/im,
  /ភ្លេចការណែនាំ|មិនអើពើនឹងការណែនាំ/u,
];

export function detectPromptInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((re) => re.test(text));
}

/**
 * Neutralize control sequences in retrieved corpus text before it is shown to
 * the model. We do not drop the passage — a page that happens to contain the
 * word "system:" is usually legitimate content — we defang the delimiters and
 * let the fencing in lib/ai/context.ts do the rest.
 */
export function defangCorpusText(text: string): string {
  return text
    .replace(/<\|?(im_start|im_end|system|endoftext)\|?>/gi, " ")
    .replace(/^\s*(system|assistant|developer)\s*:/gim, "$1 -")
    .replace(/```/g, "'''")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Inbound message validation ────────────────────────────────────────────────
export interface InboundMessage {
  role: "user" | "model";
  text: string;
}

export type ValidationResult =
  | { ok: true; messages: InboundMessage[] }
  | { ok: false; error: string };

/**
 * Validate the legacy `{ role, text }[]` wire shape used by AskWidget.
 * Rejects oversized bodies before any DB or model work happens.
 */
export function validateMessages(raw: unknown): ValidationResult {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: "messages must be a non-empty array." };
  }
  if (raw.length > MAX_INBOUND_TURNS) {
    return { ok: false, error: `messages array exceeds ${MAX_INBOUND_TURNS} turns.` };
  }
  const out: InboundMessage[] = [];
  for (const m of raw) {
    if (typeof m !== "object" || m === null) {
      return { ok: false, error: "Each message must be an object." };
    }
    const obj = m as Record<string, unknown>;
    const role = obj["role"];
    const text = obj["text"];
    if (typeof role !== "string" || !["user", "model"].includes(role) || typeof text !== "string") {
      return { ok: false, error: "Each message must have role ('user'|'model') and text (string)." };
    }
    if (text.length > MAX_MESSAGE_CHARS) {
      return { ok: false, error: `Message exceeds ${MAX_MESSAGE_CHARS} characters.` };
    }
    out.push({ role: role as InboundMessage["role"], text });
  }
  if (!out.some((m) => m.role === "user" && m.text.trim())) {
    return { ok: false, error: "No user message found." };
  }
  return { ok: true, messages: out };
}

/**
 * True when the newest user message repeats the previous one verbatim.
 * A resend is almost always a double-submit, and answering it costs a full
 * request against the user's daily quota.
 */
export function isDuplicateTurn(messages: readonly InboundMessage[]): boolean {
  const users = messages.filter((m) => m.role === "user");
  if (users.length < 2) return false;
  const a = users[users.length - 1].text.trim().toLowerCase();
  const b = users[users.length - 2].text.trim().toLowerCase();
  return a === b && a.length > 0;
}

// ── Output grounding ──────────────────────────────────────────────────────────
// The model may cite ONLY page numbers that retrieval actually returned. This
// is enforced after generation rather than trusted from the prompt, because a
// prompt rule is a request and a regex is a guarantee (§13).

const CITATION_RE = /\(([^()]{1,120}?),\s*(?:p\.?|page|ទំព័រ)\s*([\d០-៩]{1,4})\)/giu;
const KHMER_DIGITS = "០១២៣៤៥៦៧៨៩";

function toArabic(s: string): number {
  return Number.parseInt(s.replace(/[០-៩]/gu, (d) => String(KHMER_DIGITS.indexOf(d))), 10);
}

export interface ExtractedCitation {
  raw: string;
  title: string;
  page: number;
}

export function extractCitations(answer: string): ExtractedCitation[] {
  const out: ExtractedCitation[] = [];
  for (const m of answer.matchAll(CITATION_RE)) {
    const page = toArabic(m[2]);
    if (Number.isFinite(page)) out.push({ raw: m[0], title: m[1].trim(), page });
  }
  return out;
}

function normTitle(s: string): string {
  return s.toLowerCase().replace(/["“”'’]/g, "").replace(/\s+/g, " ").trim();
}

export interface GroundingResult {
  /** Answer with unsupported citations removed. */
  answer: string;
  /** Citations that matched a retrieved passage. */
  grounded: ExtractedCitation[];
  /** Citations the model invented — removed from the answer. */
  hallucinated: ExtractedCitation[];
}

/**
 * Remove any `(Title, p. N)` the retrieval set does not support. A title match
 * alone is not enough: the page must be one we actually retrieved for that
 * title, otherwise the model has guessed a page inside a real book.
 */
export function enforceGrounding(answer: string, allowed: readonly Source[]): GroundingResult {
  const cites = extractCitations(answer);
  if (cites.length === 0) return { answer, grounded: [], hallucinated: [] };

  const allowedPages = new Map<string, Set<number>>();
  for (const s of allowed) {
    if (s.page === undefined) continue;
    const key = normTitle(s.title);
    if (!allowedPages.has(key)) allowedPages.set(key, new Set());
    allowedPages.get(key)!.add(s.page);
  }

  const grounded: ExtractedCitation[] = [];
  const hallucinated: ExtractedCitation[] = [];
  let out = answer;
  for (const c of cites) {
    const key = normTitle(c.title);
    // Retrieval titles are the authority; accept a citation whose title is a
    // prefix/substring of a retrieved one (models shorten long titles).
    let pages: Set<number> | undefined = allowedPages.get(key);
    if (!pages) {
      for (const [k, v] of allowedPages) {
        if (k.includes(key) || key.includes(k)) { pages = v; break; }
      }
    }
    if (pages?.has(c.page)) grounded.push(c);
    else {
      hallucinated.push(c);
      out = out.split(c.raw).join("");
    }
  }
  return { answer: out.replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;។])/g, "$1").trim(), grounded, hallucinated };
}
