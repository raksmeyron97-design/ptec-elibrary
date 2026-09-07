/* scripts/test-local-ai.ts
 *
 * Does the local AI actually work for THIS library, from where the app runs?
 *
 *   npx tsx scripts/test-local-ai.ts
 *   npx tsx scripts/test-local-ai.ts --verbose      # print the model's answer
 *   npx tsx scripts/test-local-ai.ts --skip-embed   # connectivity + chat only
 *
 * infra/ai/scripts/healthcheck.sh answers "is the daemon up" from the box.
 * This answers the question that actually matters: can the application, with
 * the environment it will really run under, get a Khmer answer and a vector
 * of the width its index expects — and does it survive the box going away.
 *
 * Seven checks, in dependency order. Each one is a thing that has its own way
 * of being broken, and a later check cannot be trusted if an earlier one
 * failed:
 *
 *   1. configuration      what the environment resolves to (no network)
 *   2. reachability       /api/tags — is anything listening
 *   3. models present     downloaded ≠ configured; a tag typo lands here
 *   4. English chat       the OpenAI-compatible endpoint end to end
 *   5. Khmer chat         Khmer in, Khmer out — a model that answers English
 *                         fluently can still return mojibake or Thai here,
 *                         and this library is mostly Khmer
 *   6. embeddings         a vector, its width, and whether that width is what
 *                         the pgvector columns hold
 *   7. fallback           Ollama pointed at a dead port: does Gemini answer,
 *                         and does the breaker stop paying the timeout
 *
 * Exit code 0 when everything required passed. A skipped optional check (no
 * Gemini key, embeddings on Gemini) is not a failure.
 */

import { config } from "dotenv";
// tsx does NOT auto-load env like Next.js. .env.local first, then .env —
// the same order the other scripts use.
config({ path: ".env.local" });
config();

import {
  chatConfiguredFor,
  embeddingsConfiguredFor,
  geminiFallbackAvailable,
  resolveProviderConfig,
} from "../lib/ai/provider-config";
import { createAIProvider } from "../lib/ai/provider";
import { modelIsPresent, ollamaHealth, OllamaError } from "../lib/ai/ollama";

const VERBOSE = process.argv.includes("--verbose");
const SKIP_EMBED = process.argv.includes("--skip-embed");
const SKIP_FALLBACK = process.argv.includes("--skip-fallback");

const KHMER_PROMPT = "តើបណ្ណាល័យគឺជាអ្វី? សូមពន្យល់សង្ខេបជាភាសាខ្មែរ";
const ENGLISH_PROMPT = "In one short sentence, what is a library?";

// ── Reporting ────────────────────────────────────────────────────────────────
type Outcome = "pass" | "fail" | "skip";
const results: { name: string; outcome: Outcome; note: string }[] = [];

const ICON: Record<Outcome, string> = { pass: "✔", fail: "✖", skip: "–" };

function record(name: string, outcome: Outcome, note: string): void {
  results.push({ name, outcome, note });
  console.log(`  ${ICON[outcome]} ${name}${note ? ` — ${note}` : ""}`);
}

function heading(text: string): void {
  console.log(`\n── ${text} ──`);
}

function ms(started: number): string {
  return `${Date.now() - started} ms`;
}

/** One line of an error, never a stack — this output is read, not debugged. */
function reason(err: unknown): string {
  if (err instanceof OllamaError) return `${err.kind}: ${err.message.slice(0, 160)}`;
  if (err instanceof Error) return err.message.slice(0, 160);
  return String(err).slice(0, 160);
}

/** Khmer letters, U+1780–U+17FF. Enough to tell a Khmer answer from an English one. */
function khmerRatio(text: string): number {
  const letters = text.replace(/\s/g, "");
  if (!letters.length) return 0;
  const khmer = letters.match(/[ក-៿]/g)?.length ?? 0;
  return khmer / letters.length;
}

function preview(text: string, limit = 220): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<number> {
  const cfg = resolveProviderConfig(process.env);
  const provider = createAIProvider(cfg, { log: () => {} });

  // 1 ── Configuration ───────────────────────────────────────────────────────
  heading("1. Configuration");
  console.log(`  AI_PROVIDER              ${cfg.chatProvider}`);
  console.log(`  OLLAMA_BASE_URL          ${cfg.ollamaBaseUrl}`);
  console.log(`  OLLAMA_CHAT_MODEL        ${cfg.ollamaChatModel}`);
  console.log(`  AI_EMBED_PROVIDER        ${cfg.embedProvider}`);
  console.log(`  embedding model          ${cfg.embedModel} @ ${cfg.embedDim} dims`);
  console.log(`  fallback to Gemini       ${cfg.fallbackToGemini ? "enabled" : "DISABLED"}`);
  console.log(`  GEMINI_API_KEY           ${cfg.geminiApiKey ? "set" : "NOT set"}`);
  console.log("");

  if (!chatConfiguredFor(cfg)) {
    record("a backend can generate text", "fail", "neither Ollama nor a Gemini key is configured");
    return 1;
  }
  record("a backend can generate text", "pass", cfg.chatProvider);
  record(
    "a backend can embed",
    embeddingsConfiguredFor(cfg) ? "pass" : "fail",
    `${cfg.embedProvider} / ${cfg.embedModel}`,
  );
  if (cfg.chatProvider === "ollama" && !geminiFallbackAvailable(cfg)) {
    record(
      "cloud fallback",
      "skip",
      cfg.fallbackToGemini ? "no GEMINI_API_KEY — a local outage becomes an assistant outage" : "disabled by LOCAL_AI_FALLBACK_TO_GEMINI",
    );
  }

  if (cfg.chatProvider !== "ollama" && cfg.embedProvider !== "ollama") {
    console.log("\nAI_PROVIDER is not `ollama` and neither is AI_EMBED_PROVIDER — nothing local to test.");
    console.log("Set AI_PROVIDER=ollama in .env.local to exercise the box.");
    return 0;
  }

  // 2 ── Reachability ────────────────────────────────────────────────────────
  heading("2. Reachability");
  const health = await ollamaHealth({
    baseUrl: cfg.ollamaBaseUrl,
    rootUrl: cfg.ollamaRootUrl,
    timeoutMs: cfg.ollamaTimeoutMs,
  });
  if (!health.ok) {
    record("GET /api/tags", "fail", health.error ?? "no answer");
    console.log("");
    console.log("  The box is not answering. In order:");
    console.log("    docker compose -f infra/ai/docker-compose.yml ps");
    console.log("    docker logs --tail 50 ptec-ollama");
    console.log(`    curl -s ${cfg.ollamaRootUrl}/api/tags`);
    console.log("  If the app runs in Docker, OLLAMA_BASE_URL must be the container name");
    console.log("  (http://ptec-ollama:11434/v1), not localhost — see docs/LOCAL_AI_OLLAMA_SETUP.md.");
    return 1;
  }
  record("GET /api/tags", "pass", `${health.latencyMs} ms, ${health.models.length} model(s)`);

  // 3 ── Models present ──────────────────────────────────────────────────────
  heading("3. Models");
  const chatPresent = modelIsPresent(health.models, cfg.ollamaChatModel);
  record(`chat model ${cfg.ollamaChatModel}`, chatPresent ? "pass" : "fail", chatPresent ? "installed" : "NOT installed");
  if (cfg.embedProvider === "ollama") {
    const embedPresent = modelIsPresent(health.models, cfg.ollamaEmbedModel);
    record(
      `embedding model ${cfg.ollamaEmbedModel}`,
      embedPresent ? "pass" : "fail",
      embedPresent ? "installed" : "NOT installed",
    );
  }
  if (!chatPresent) {
    console.log(`\n  Installed: ${health.models.join(", ") || "(none)"}`);
    console.log("  Pull the missing model:  infra/ai/scripts/init-models.sh");
    return 1;
  }

  // 4 ── English chat ────────────────────────────────────────────────────────
  heading("4. Chat completion (English)");
  let started = Date.now();
  try {
    const { text, trace } = await provider.complete(ENGLISH_PROMPT, [], { maxOutputTokens: 120 });
    const ok = text.trim().length > 0;
    record("a non-empty answer", ok ? "pass" : "fail", `${ms(started)} via ${trace.provider}`);
    if (VERBOSE || !ok) console.log(`      ${preview(text)}`);
    if (trace.fellBack) {
      record("answered locally", "fail", `Gemini answered instead (${trace.primaryError ?? "local call failed"})`);
    }
  } catch (err) {
    record("a non-empty answer", "fail", reason(err));
  }

  // 5 ── Khmer chat ──────────────────────────────────────────────────────────
  // The check that matters most for this collection: a model can be fluent in
  // English and still answer a Khmer question in Thai, in English, or in
  // broken clusters. A low ratio is a MODEL choice problem, not a wiring one.
  heading("5. Chat completion (Khmer)");
  started = Date.now();
  try {
    const { text, trace } = await provider.complete(KHMER_PROMPT, [], { maxOutputTokens: 220 });
    const ratio = khmerRatio(text);
    const answered = text.trim().length > 0;
    record("a non-empty answer", answered ? "pass" : "fail", `${ms(started)} via ${trace.provider}`);
    if (answered) {
      record(
        "answered IN Khmer",
        ratio >= 0.5 ? "pass" : "fail",
        `${Math.round(ratio * 100)}% Khmer characters`,
      );
      if (ratio < 0.5) {
        console.log("      The model replied, but not in Khmer. Try a larger model (qwen2.5:7b),");
        console.log("      or leave AI_PROVIDER=gemini for Khmer traffic. See setup guide §6.");
      }
    }
    if (VERBOSE || !answered || ratio < 0.5) console.log(`      ${preview(text)}`);
  } catch (err) {
    record("a non-empty answer", "fail", reason(err));
  }

  // 6 ── Embeddings ──────────────────────────────────────────────────────────
  heading("6. Embeddings");
  if (SKIP_EMBED) {
    record("vector generation", "skip", "--skip-embed");
  } else if (cfg.embedProvider !== "ollama") {
    record(
      "vector generation",
      "skip",
      `AI_EMBED_PROVIDER=${cfg.embedProvider} — the index holds ${cfg.embedModel} vectors`,
    );
  } else {
    started = Date.now();
    try {
      const vectors = await provider.generateEmbedding([KHMER_PROMPT, ENGLISH_PROMPT]);
      record("one vector per input", vectors.length === 2 ? "pass" : "fail", `${vectors.length}/2 in ${ms(started)}`);
      const width = vectors[0]?.length ?? 0;
      record(
        `width matches the index (${cfg.embedDim})`,
        width === cfg.embedDim ? "pass" : "fail",
        `${width} dims`,
      );
      // A vector the provider hands back is L2-normalised; cosine distance in
      // pgvector assumes it. A magnitude far from 1 means it is not.
      const magnitude = Math.sqrt((vectors[0] ?? []).reduce((s, x) => s + x * x, 0));
      record("L2-normalised", Math.abs(magnitude - 1) < 1e-6 ? "pass" : "fail", `|v| = ${magnitude.toFixed(6)}`);
    } catch (err) {
      record("vector generation", "fail", reason(err));
    }
  }

  // 7 ── Fallback ────────────────────────────────────────────────────────────
  // Simulated by pointing a throwaway provider at a port nothing listens on —
  // the same failure a stopped container produces, without stopping it.
  heading("7. Fallback behaviour (simulated outage)");
  if (SKIP_FALLBACK) {
    record("Gemini answers when the box is down", "skip", "--skip-fallback");
  } else if (!geminiFallbackAvailable(cfg)) {
    record(
      "Gemini answers when the box is down",
      "skip",
      cfg.fallbackToGemini ? "no GEMINI_API_KEY" : "LOCAL_AI_FALLBACK_TO_GEMINI is off",
    );
    console.log("      With no fallback, a stopped container means no assistant at all.");
  } else {
    const deadPort = { ...cfg, ollamaBaseUrl: "http://127.0.0.1:1/v1", ollamaRootUrl: "http://127.0.0.1:1", ollamaTimeoutMs: 4_000 };
    const degraded = createAIProvider(deadPort, { log: () => {} });
    started = Date.now();
    try {
      const { text, trace } = await degraded.complete(ENGLISH_PROMPT, [], { maxOutputTokens: 60 });
      const answered = text.trim().length > 0 && trace.fellBack;
      record(
        "Gemini answers when the box is down",
        answered ? "pass" : "fail",
        `${ms(started)}, provider=${trace.provider}, local error=${trace.primaryError ?? "none"}`,
      );
      if (VERBOSE) console.log(`      ${preview(text)}`);

      // …and the breaker must stop paying the connection timeout.
      await degraded.complete("second", [], { maxOutputTokens: 20 });
      await degraded.complete("third", [], { maxOutputTokens: 20 });
      const fourth = Date.now();
      const { trace: t4 } = await degraded.complete("fourth", [], { maxOutputTokens: 20 });
      record(
        "the breaker stops retrying a dead box",
        t4.primarySkipped ? "pass" : "fail",
        t4.primarySkipped ? `skipped the local call, ${ms(fourth)}` : "still calling the dead box every request",
      );
    } catch (err) {
      record("Gemini answers when the box is down", "fail", reason(err));
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const failed = results.filter((r) => r.outcome === "fail");
  const skipped = results.filter((r) => r.outcome === "skip");
  heading("Summary");
  console.log(
    `  ${results.length - failed.length - skipped.length} passed · ${failed.length} failed · ${skipped.length} skipped`,
  );
  if (failed.length) {
    console.log("");
    for (const f of failed) console.log(`  ✖ ${f.name} — ${f.note}`);
    console.log("\n  Troubleshooting: docs/LOCAL_AI_OLLAMA_SETUP.md §7");
    return 1;
  }
  console.log("\n✅ Local AI is working for this library.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`\n✖ diagnostic crashed: ${err instanceof Error ? err.stack : err}`);
    process.exit(1);
  });
