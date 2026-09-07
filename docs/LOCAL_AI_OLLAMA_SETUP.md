# Local AI on ZimaOS (Ollama)

Run the assistant's language model on the box instead of paying Gemini for it,
without giving up the answer when the box cannot cope.

- **Code**: `lib/ai/provider.ts` (the decision), `lib/ai/ollama.ts` (the client
  and the AI-SDK adapter), `lib/ai/provider-config.ts` (the environment),
  `lib/ai/circuit-breaker.ts`.
- **Infrastructure**: `infra/ai/`.
- **Check it works**: `npm run ai:local-check` (`scripts/test-local-ai.ts`).
- **Related**: `docs/AI_ASSISTANT_ARCHITECTURE.md` (what the assistant does at
  all), `docs/ZIMAOS-DEPLOYMENT.md` (the box), `docs/RESEARCH-RETRIEVAL.md`
  (where the evidence comes from).

---

## 1. What this changes, and what it does not

The assistant already answers most questions without a model. Every request is
classified deterministically and 85 of 100 benchmark questions are answered
from the database plus a bilingual template — no model call at all
(`deterministicAnswer()` in `lib/ai/plan.ts`). Local AI changes who serves the
remaining ~15%, and nothing else.

Three things are deliberately **not** moved to the box:

| Job | Provider | Why |
|---|---|---|
| Assistant answers, search summaries | **Ollama**, Gemini on failure | The bill, and only the bill |
| Embeddings for semantic search | **Gemini**, until §5 is done | Every stored vector is Gemini's; mixing spaces is silent noise |
| PDF page OCR, metadata drafting | **Gemini Vision only** | Khmer Unicode accuracy is the whole point of that step, and Ollama has no vision model that comes close |

`scripts/repair-khmer-pages.ts` and `app/actions/ai-extraction.ts` still call
Gemini directly and are untouched by any setting here.

**Local AI is a self-hosted feature.** Functions running on Vercel cannot reach
a box on a home LAN, so `AI_PROVIDER=ollama` only means anything for the
ZimaOS deployment. A Vercel deploy leaves the variable unset and behaves
exactly as before.

### The two switches

```
AI_PROVIDER        who GENERATES text     freely switchable, falls back
AI_EMBED_PROVIDER  who EMBEDS             bound to the index, never falls back
```

They are separate because their failure modes are not alike. A Gemini answer
to a question the box could not take is the same answer to the reader. A
Gemini vector compared against bge-m3 vectors is **noise that looks like a
result** — pgvector will happily rank any two vectors of equal width and
return confident nonsense. So text falls back and embeddings refuse to.

---

## 2. Quick start on ZimaOS

Ten minutes, most of it downloading.

```bash
# On the box, in the repo (see docs/ZIMAOS-DEPLOYMENT.md for where that is)
cd /DATA/AppData/ptec-elibrary/app/infra/ai

# 1. Start the daemon. Model weights live on /DATA and survive restarts.
docker compose up -d

# 2. Pull the models (several GB — the slow step).
./scripts/init-models.sh

# 3. Confirm the daemon answers and holds what the app expects.
./scripts/healthcheck.sh
```

`init-models.sh` waits for the API rather than assuming the container being
"up" means the daemon is listening, pulls only what is missing, and then
actually **runs** the chat model once — a pull can succeed for a model this
box has no RAM to load, and that failure belongs here rather than in a
reader's first question.

Useful variants:

```bash
CHAT_MODEL=qwen2.5:7b ./scripts/init-models.sh   # a bigger model (see §8)
./scripts/init-models.sh --chat-only             # embeddings stay on Gemini
./scripts/healthcheck.sh --json                  # for a monitor or cron
./scripts/healthcheck.sh --quiet                 # exit code only
```

---

## 3. Point the app at the box

The app container reaches Ollama by **container name over a shared Docker
network**, not through the published port. Bring the app up with the override
that joins that network:

```bash
cd /DATA/AppData/ptec-elibrary/app
docker compose -f docker-compose.yml -f infra/ai/docker-compose.app.yml \
  --profile tunnel up -d
```

and in the app's `.env`:

```env
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://ptec-ollama:11434/v1
OLLAMA_CHAT_MODEL=qwen2.5:3b
LOCAL_AI_FALLBACK_TO_GEMINI=true
GEMINI_API_KEY=...        # still required: fallback, embeddings, OCR
```

Then verify from where the app actually runs:

```bash
docker exec ptec-elibrary node -e \
  "fetch('http://ptec-ollama:11434/api/tags').then(r=>r.json()).then(d=>console.log(d.models.map(m=>m.name)))"
```

`http://localhost:11434/v1` is correct only when the app runs **outside**
Docker (a laptop, `npm run dev`). Inside a container, `localhost` is that
container, and this is the single most common way this setup fails.

The override is a separate file on purpose: an `external: true` network must
already exist or *every* `docker compose up` fails. Keeping the join opt-in
means a box with the AI stack stopped still deploys, and the app falls back to
Gemini by itself.

### Confirm it end to end

```bash
npm run ai:local-check          # or: npx tsx scripts/test-local-ai.ts --verbose
```

Seven checks in dependency order: configuration, reachability, models present,
English chat, **Khmer chat**, embeddings with a width check, and a simulated
outage that proves Gemini takes over and the breaker stops retrying a dead
box. Exit 0 when everything required passed.

---

## 4. Switching models

```bash
# Pull a different model
docker exec ptec-ollama ollama pull qwen2.5:7b

# Tell the app to use it, then restart the app (not the daemon)
#   .env:  OLLAMA_CHAT_MODEL=qwen2.5:7b
docker compose up -d app

# What is installed, and what is loaded right now
docker exec ptec-ollama ollama list
docker exec ptec-ollama ollama ps      # PROCESSOR column: CPU or GPU

# Reclaim disk from a model you no longer use
docker exec ptec-ollama ollama rm qwen2.5:3b
```

Changing `OLLAMA_CHAT_MODEL` is free and reversible — it is generation only.
Changing `OLLAMA_EMBED_MODEL` is not; read §5 first.

Candidates that handle Khmer at all (§6 has the honest assessment):

| Model | Disk | Loaded RAM | Notes |
|---|---|---|---|
| `qwen2.5:3b` | 1.9 GB | ~3 GB | The default. Fits beside Supabase on 8 GB |
| `qwen2.5:7b` | 4.7 GB | ~6 GB | Noticeably better Khmer; needs 16 GB or a GPU |
| `gemma2:9b` | 5.4 GB | ~7 GB | Strong multilingual, slower still |
| `bge-m3` | 1.2 GB | ~1.5 GB | Embeddings only, 1024 dims |

---

## 5. Embeddings and the index — read before switching

`AI_EMBED_PROVIDER` defaults to `gemini` **even when `AI_PROVIDER=ollama`**,
and that default is load-bearing.

Every vector in `books.embedding`, `research_reports.embedding`,
`catalog_books.embedding`, `publications.embedding` and
`book_chunks.embedding` was produced by `gemini-embedding-001` at 768
dimensions, and the columns are declared `vector(768)`. bge-m3 emits **1024**.
Two consequences:

- A 1024-dim query vector against a `vector(768)` column is rejected outright
  by pgvector — a loud failure, which is the good case.
- If the columns were widened without re-embedding, a bge-m3 query against
  Gemini document vectors would return **confidently ranked nonsense**, with
  nothing in the UI to indicate it.

So the switch is a migration, not a setting. In order:

1. **Write a migration** widening every embedding column to `vector(1024)` and
   rebuilding the four HNSW indexes plus `match_library`, `match_books`,
   `match_book_chunks` and `match_record_chunks` (their `query_embedding`
   parameter is typed too). Ship it through `.github/workflows/migrate.yml`
   like any other — never by hand in the SQL editor.
2. **Set `AI_EMBED_PROVIDER=ollama`** and `OLLAMA_EMBED_DIM=1024` in `.env`.
3. **Re-embed everything**: `npx tsx scripts/embed-library.ts --all`. The
   script now embeds one probe and runs it through `match_book_chunks` before
   writing anything, so a dimension the database does not accept stops the run
   at the first second rather than halfway through the library.
4. **Re-measure**: `npm run retrieval:benchmark` and `npm run search:benchmark`.
   Neither benchmark's number carries over across a change of embedding model
   — the vector-only baseline scores 0% on this collection, and a quiet
   regression here is invisible to every other check.

Until all four are done, leave it on `gemini`. Embedding is cheap and
infrequent (new uploads only); generation is the recurring bill.

`lib/ai/provider.ts` enforces the width on every call and refuses a vector
that disagrees with `EMBEDDING_DIM`, so a half-finished migration fails at the
provider instead of writing poison into pgvector.

---

## 6. Khmer quality — what to expect

This collection is mostly Khmer, and that is the deciding factor for whether
local AI is worth switching on.

- **`qwen2.5:3b` understands Khmer questions better than it writes Khmer
  answers.** It will sometimes reply in English to a Khmer question, or
  produce Khmer with malformed coeng stacks. `scripts/test-local-ai.ts` check 5
  measures exactly this and fails below 50% Khmer characters — it is a model
  choice signal, not a wiring bug.
- **`qwen2.5:7b` is materially better** and is the right default on any box
  with 16 GB or a GPU.
- **Gemini is still better than both at Khmer.** If check 5 fails and a bigger
  model is not an option, leaving `AI_PROVIDER=gemini` is a legitimate
  outcome: the infrastructure here costs nothing while unused.

None of this affects retrieval. Which passages an answer is built from is
decided by `lib/ai/retrieval.ts` and the embedding model, not by the chat
model, so a weaker local model gives a weaker *paraphrase* of the right
evidence, with the same verified citations — `enforceGrounding()` deletes any
citation the retrieval set does not support, whichever model wrote it.

---

## 7. Troubleshooting

Run `npm run ai:local-check` first; it names the failing stage.

**"Ollama is unreachable"**

```bash
docker compose -f infra/ai/docker-compose.yml ps
docker logs --tail 50 ptec-ollama
curl -s http://127.0.0.1:11434/api/tags
```

If curl works on the box but the app disagrees, `OLLAMA_BASE_URL` is almost
certainly `localhost` inside a container — see §3.

**Answers are slow, then suddenly fast and worse.** That is the fallback
working. The box timed out (default 60 s) and Gemini answered. After three
consecutive failures the breaker opens and the box is skipped for 60 s, so
requests stop paying the timeout at all. Confirm from telemetry:

```sql
select detail->>'provider' as provider,
       count(*) filter (where detail->>'provider_fallback' = 'true') as fell_back,
       count(*) as total,
       round(avg(latency_ms)) as avg_ms
from app_events
where kind = 'ai_request' and created_at > now() - interval '1 day'
group by 1;
```

A `fell_back` count near `total` means the box is not really serving.

**"model requires more system memory than is available"** — the model is too
large for the container limit. Use a smaller model or raise
`OLLAMA_MEMORY_LIMIT` in `infra/ai/docker-compose.yml`, but check §8 first:
Supabase and the app want their share of the same 8 GB.

**First request after an idle period is slow.** Expected.
`OLLAMA_KEEP_ALIVE=10m` unloads an idle model to give the RAM back; the next
request pays the load (a few seconds for a 3B). Raise it to `24h` to keep the
model resident, at the cost of holding that memory permanently.

**Everything answers but nothing is local.** Check `AI_PROVIDER` is actually
reaching the container (`docker exec ptec-elibrary env | grep -i ollama`) —
`NEXT_PUBLIC_*` values are baked at build time, but these are runtime values
read from `.env`, so a stale `.env` needs `docker compose up -d app`, not a
rebuild.

**A stopped AI stack.** Nothing to do. The app fails over to Gemini and keeps
serving; `docker compose -f infra/ai/docker-compose.yml up -d` brings it back
and the breaker closes on the next successful call.

---

## 8. Hardware sizing

The ZimaOS box runs three things at once. Budget for all of them:

| Component | Steady state | Ceiling |
|---|---|---|
| Self-hosted Supabase | ~2 GB | 4.2 GB (`infra/supabase/docker-compose.yml`) |
| The app | ~400 MB | 1 GB |
| **Ollama + qwen2.5:3b** | 0 idle, ~3 GB loaded | 5 GB (`OLLAMA_MEMORY_LIMIT`) |

| Box | Verdict |
|---|---|
| **8 GB, CPU** | `qwen2.5:3b` only, and only with `OLLAMA_KEEP_ALIVE` set so idle costs nothing. This is the tested configuration. 7b will not fit beside Supabase. |
| **16 GB, CPU** | `qwen2.5:7b` fits. Expect 15–40 s for a full answer; the fallback timeout matters. |
| **16 GB + NVIDIA (8 GB VRAM)** | `qwen2.5:7b` at roughly 10× CPU speed. Uncomment the GPU block in `infra/ai/docker-compose.yml` and follow the instructions beside it. |
| **< 8 GB** | Leave `AI_PROVIDER=gemini`. |

**CPU throughput, honestly.** A 3B at Q4 on four modern x86 cores produces
roughly 8–15 tokens/second. A 200-token answer is 15–25 seconds. That is
inside the 60 s default budget but slow enough that readers notice, and it is
the strongest argument for a GPU or for staying on Gemini for the Khmer
traffic. Disk: allow 10 GB for weights and the manifest cache.

The daemon's concurrency settings default to one request at a time
(`OLLAMA_NUM_PARALLEL=1`) with a queue of 16. On CPU that is correct: two
readers sharing the cores is slower for both than queueing. A refusal past the
queue is fast, and the app answers it from Gemini.

---

## 9. What to watch

`lib/ai/telemetry.ts` writes one `app_events` row per AI request carrying
`provider` and `provider_fallback` — counts and enums only, never message
content. Two figures are worth a dashboard tile:

- **local share** — `provider = 'ollama'` over all model-backed requests. This
  is the saving.
- **fallback rate** — `provider_fallback = 'true'`. Rising means the box is
  struggling; sustained near 100% means it is down and only Gemini is
  answering, which costs money silently.

`infra/ai/scripts/healthcheck.sh --json` is suitable for a cron or an
UptimeRobot keyword check, and returns non-zero when a required model is
missing as well as when the daemon is down — a daemon that is up without its
model looks healthy from outside and fails every real request.
