# PTEC e-Library — self-hosted Khmer OCR worker.
#
# A batch/one-shot worker, not a service: it is started, it OCRs what it was
# asked to, and it exits. See infra/ocr/docker-compose.yml.
#
# Build (from the repository root, which is the build context):
#   docker build -f infra/ocr/Dockerfile -t ptec-ocr .
#
# ── Why Debian and not the app image's Alpine ───────────────────────────────
#
# The main Dockerfile is `node:22-alpine`. Alpine's `tesseract-ocr-data-khm`
# tracks whatever is in the current community repo and is not present in every
# mirror; Debian bookworm ships `tesseract-ocr-khm` as a first-class package
# pinned by the distribution release, which is the reproducible source this
# pipeline needs. Being a different base than the app costs nothing here — this
# image runs CLI scripts, never Next.js.
#
# ── Why the verification RUN is not cosmetic ────────────────────────────────
#
# Without `khm.traineddata`, tesseract does not fail: it falls back to English
# and returns confident Latin gibberish for every Khmer page. That failure is
# invisible until a human reads the output, so it is caught at BUILD time here.
# A build that produced an image which cannot read Khmer would be worse than no
# image at all.

FROM node:22-bookworm-slim

# tesseract-ocr        the engine (bookworm ships 5.3.x)
# tesseract-ocr-khm    Khmer traineddata — the reason this image exists
# tesseract-ocr-eng    English, for mixed Khmer/English pages (khm+eng)
# poppler-utils        pdftoppm (rasterise) and pdfinfo (page count)
# ca-certificates      HTTPS to Zima storage and Supabase
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      tesseract-ocr \
      tesseract-ocr-khm \
      tesseract-ocr-eng \
      poppler-utils \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# Fail the build here rather than fail a book later. `grep -qx` is an exact
# whole-line match: `khm` must be its own entry, not a substring of `khmer` or
# of the header line.
RUN set -eu; \
    node --version; \
    tesseract --version; \
    pdftoppm -v 2>&1 | head -1; \
    pdfinfo -v 2>&1 | head -1; \
    langs="$(tesseract --list-langs 2>&1)"; \
    echo "$langs"; \
    echo "$langs" | grep -qx khm || { echo "FATAL: khm traineddata missing"; exit 1; }; \
    echo "$langs" | grep -qx eng || { echo "FATAL: eng traineddata missing"; exit 1; }

WORKDIR /app

# Dependencies first so a source edit does not reinstall them. devDependencies
# are REQUIRED: `tsx` and `dotenv` are the runtime of every script in scripts/.
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-assets.mjs scripts/
RUN mkdir -p public && npm ci

COPY . .

# Rendered pages are written here and deleted page by page; mounted as a
# volume in compose so a long run cannot fill the container's writable layer.
#
# Only /work changes hands. /app stays root-owned and world-readable, which is
# what a non-root worker actually needs — `chown -R` over a node_modules tree
# of ~40,000 files adds minutes to every build to grant a permission nothing
# uses, and an application directory the runtime user cannot modify is the
# stronger posture anyway.
ENV OCR_WORK_DIR=/work
RUN mkdir -p /work && chown node:node /work

# Non-root, like the application image. Nothing here needs privileges.
USER node

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

# Default to the safe thing: report the environment and do nothing. A container
# started with no command must never begin writing to a library.
CMD ["npx", "tsx", "scripts/ocr-khmer-tesseract.ts", "--check-env"]
