# PTEC e-Library — production image for ZimaOS (or any Docker host).
#
# Build:  docker build -t ptec-elibrary .
# Run:    see docker-compose.yml (env vars are injected at runtime, NOT baked in)
#
# Security properties:
#   - multi-stage: dev dependencies and source never reach the final image
#   - runs as non-root user `nextjs` (uid 1001)
#   - only .next/standalone + static assets shipped — no .env, no .git
#   - NODE_ENV=production, telemetry off

# ── Stage 1: install dependencies ────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY scripts/copy-pdf-assets.mjs scripts/
# postinstall runs scripts/copy-pdf-assets.mjs (needs public/ to exist)
RUN mkdir -p public && npm ci

# ── Stage 2: build ────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Public NEXT_PUBLIC_* values are compiled into the client bundle at build
# time, so they must be provided as build args (they are NOT secrets).
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_ROOT_DOMAIN
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ARG NEXT_PUBLIC_R2_PUBLIC_URL
ARG NEXT_PUBLIC_R2_COVERS_URL
RUN npm run build

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Standalone server + static assets only
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# /home is the cheapest full-stack route (static-ish public page)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/home || exit 1

CMD ["node", "server.js"]
