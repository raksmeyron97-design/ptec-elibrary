// Is the Gemini embedding quota exhausted RIGHT NOW?
//
// Distinguishes the two live hypotheses for the stalled backfill without
// needing the box: a daily-quota stop (the script exits cleanly on it) versus
// the container dying for some other reason. Same key, same project, same
// model as the run.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const { getAIProvider } = await import("../lib/ai/provider");
  const { EMBEDDING_MODEL, EMBEDDING_DIM } = await import("../lib/ai/models");
  console.log(`model ${EMBEDDING_MODEL} @ ${EMBEDDING_DIM}`);
  try {
    const v = await getAIProvider().embedQuery("quota probe: does this key still embed?");
    console.log(`  OK — ${v?.length ?? 0} dims. The quota is NOT exhausted.`);
    console.log("  → the stall is something else: container exited, OOM, or a network fault on the box.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  FAILED — ${msg.slice(0, 300)}`);
    console.log("  → consistent with a quota/rate stop; the script exits cleanly on that and keeps what it did.");
  }
}
main();
