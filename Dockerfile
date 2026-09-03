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
# `next build` runs the TypeScript check in-process, and this project OOMs it at
# Node's default heap — the same reason CI runs `tsc --noEmit` with this exact
# flag (see .github/workflows/ci.yml and CLAUDE.md). Without it the build dies
# with "Reached heap limit Allocation failed" partway through type checking.
# Node sizes the default heap from the host's RAM, so whether this bites depends
# on the machine: it passed on a laptop and failed in a 7.7 GB Docker VM. Pin it
# rather than leave the image build dependent on where it happens to run.
ENV NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096
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

# `next build` prerenders the public pages, and app/[locale]/(public)/layout.tsx
# calls getSiteConfig() -> createServiceClient(), which reads the service-role-
# only site_settings table (migration 0098). So the BUILD needs the service-role
# key, not just the NEXT_PUBLIC_* values — without it every public route fails
# with "supabaseKey is required" and the export aborts.
#
# It is mounted as a BuildKit secret, NOT passed as an ARG: that key bypasses
# RLS entirely, and ARG values are recoverable from `docker history`. A secret
# mount exists only for the duration of this RUN and is never written to a
# layer. `env=` exposes it as an environment variable to the build.
RUN --mount=type=secret,id=supabase_service_role_key,env=SUPABASE_SERVICE_ROLE_KEY \
    npm run build

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

# Mount point for the chunked-upload staging volume (docker-compose.yml).
#
# It has to exist in the IMAGE, owned by the runtime user. Docker seeds a named
# volume from whatever is at its mount point — including the ownership — the
# first time it is attached; with no such directory the volume is created owned
# by root, and this container runs as uid 1001, so the first chunk write fails
# with EACCES on a filesystem the operator can see is writable.
RUN mkdir -p /app/.upload-staging && chown nextjs:nodejs /app/.upload-staging

USER nextjs
EXPOSE 3000

# / is the cheapest full-stack route (static-ish public page; /home is a 308 now)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/ || exit 1

CMD ["node", "server.js"]
