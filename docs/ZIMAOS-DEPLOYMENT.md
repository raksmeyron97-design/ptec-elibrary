# PTEC e-Library — ZimaOS Deployment & Origin Protection

How to run the app on a self-hosted ZimaOS box **without exposing the box to
the internet**. Companion to `DDOS-PROTECTION.md` (edge rules, rate limits,
emergency mode) and `SECURITY-OPS.md` (monitoring, backups).
Last reviewed: 2026-08-18.

---

## 1. Target architecture

```
Visitor
  │ HTTPS
  ▼
Cloudflare  (DNS proxied ▸ DDoS absorption ▸ WAF ▸ Bot Fight ▸ rate rules ▸ cache)
  │ outbound-only tunnel (no inbound ports!)
  ▼
cloudflared container ──▶ app container (Next.js, non-root, port 3000, internal only)
        └────────────── private Docker network `web` on the ZimaOS box
                                   │ HTTPS out
                                   ▼
                    Supabase (hosted Postgres + Auth)  ·  Zima Storage (PDFs)
```

Key property: **the ZimaOS box makes only outbound connections.** `cloudflared`
dials out to Cloudflare; nothing dials in. The router needs **zero port
forwards**, so the origin IP is unguessable and un-attackable directly.

## 2. How deploys work

The box **does not build**. GitHub Actions builds the image and pushes it to
GHCR; a systemd timer on the box checks GHCR every 5 minutes and installs a new
image when there is one — rolling back automatically if the container fails its
healthcheck.

```
push to main
  ▼
.github/workflows/docker-publish.yml
  ├─ calls ci.yml first (typecheck, lint, unit, e2e) — a red build never ships
  └─ builds linux/amd64, pushes ghcr.io/raksmeyron97-design/ptec-elibrary
       ▼  (≤ 5 min later)
ZimaOS: ptec-elibrary-deploy.timer → deploy/deploy.sh
  ├─ digest unchanged?  → exit, do nothing
  ├─ pull, `compose up -d --no-deps app`, wait ≤180s for healthy
  ├─ healthy   → bring up cloudflared, prune old layers, done
  └─ unhealthy → log, record the bad digest, ROLL BACK to the previous image
```

### Why the image is amd64 only

The box is x86_64 — verified on the box itself: `uname -m` returns `x86_64`
and `lscpu` reports a 4-core GenuineIntel (QEMU virtual CPU, i.e. ZimaOS is
running virtualised).

The workflow originally built `linux/amd64,linux/arm64`. Cross-building arm64
runs the entire Next.js webpack build under QEMU emulation, which measured at
**40+ minutes against roughly 5 for amd64 alone** — and because this workflow
deliberately never cancels a run in progress, three merges in a row queued
behind each other for hours. Nothing consumed the arm64 image.

Add arm64 back to `platforms:` (and restore the `setup-qemu-action` step) only
if the library ever has to run on an ARM board. The `x-casaos.architectures`
list in `docker-compose.yml` must be kept in step, or it advertises a manifest
that does not exist.

Building on the box was the previous design (`docker compose up -d --build`).
It is gone: it compiled Next.js on a machine that also serves the site, and it
required the box to hold the source *and* the build-time env to do it.

### What the image build needs from GitHub

| Input | Where it lives | Why |
| --- | --- | --- |
| The eight `NEXT_PUBLIC_*` values | Repository **variables** | Compiled into the client bundle at build time. Not secrets — the browser receives every one of them, so keeping them visible makes them auditable rather than exposing anything. |
| `SUPABASE_SERVICE_ROLE_KEY` | Repository **secret** | Prerendering every public page goes through `app/[locale]/(public)/layout.tsx` → `getSiteConfig()` → `createServiceClient()`, which reads the service-role-only `site_settings` table (migration `0098`). |

Both are load-bearing, and a missing one used to fail in a way that looked like
success. Without the variables the image publishes fine but ships an undefined
Supabase URL to every visitor. Without the secret the build cannot prerender any
public route and dies with `supabaseKey is required`. `docker-publish.yml` now
checks all nine before building and fails with a message naming what is absent.

The service-role key is mounted as a **BuildKit secret**, never a build arg: it
bypasses RLS, and `ARG` values stay recoverable from `docker history` on the
published image. A secret mount exists only for the duration of that `RUN` and
never reaches a layer. Verified on the built image — the key appears in zero
files under `/app` and not in `docker history`, while the anon key (which is
*supposed* to be inlined) appears in 70.

Rotating the key means updating both Supabase and
`gh secret set SUPABASE_SERVICE_ROLE_KEY`, then republishing — the running
container reads it from `.env` at runtime, so the box also needs the new value.

Two further build requirements are pinned in the Dockerfile rather than here,
because they bit only inside a container: `NODE_OPTIONS=--max-old-space-size=4096`
(the in-process type check OOMs at Node's default heap, which is sized from host
RAM — it passed on a laptop and failed in a 7.7 GB Docker VM), and `next/font/google`
reaching `fonts.googleapis.com` during the build, which makes the image build
sensitive to flaky DNS. A transient `getaddrinfo` failure there is worth simply
retrying.

## 2a. One-time box setup

Do these in order. Each stage is provable on its own; do not skip ahead.

**Stage 1 — the image runs at all.** On any machine with Docker:

```bash
git clone https://github.com/raksmeyron97-design/ptec-elibrary.git
cd ptec-elibrary
cp .env.example .env          # fill in real values (never commit)
docker compose -f docker-compose.yml -f docker-compose.build.yml up -d --build
curl -I http://localhost:3000
```

**Stage 2 — the box serves the LAN.** On the ZimaOS box:

```bash
sudo mkdir -p /DATA/AppData/ptec-elibrary
sudo git clone https://github.com/raksmeyron97-design/ptec-elibrary.git \
     /DATA/AppData/ptec-elibrary/app
cd /DATA/AppData/ptec-elibrary/app
sudo cp /path/to/.env .env && sudo chmod 600 .env
```

Log in to GHCR **as root** — the timer runs as root and reads
`/DATA/AppData/ptec-elibrary/.docker`, not your user's `~/.docker`. Use a PAT
with the `read:packages` scope and nothing else:

```bash
sudo mkdir -p /DATA/AppData/ptec-elibrary/.docker
echo YOUR_PAT | sudo DOCKER_CONFIG=/DATA/AppData/ptec-elibrary/.docker \
     docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
sudo ./deploy/install.sh
```

Then from **another machine on the same network**: `curl -I http://<box-lan-ip>:3000`.

`install.sh` starts without the tunnel while `TUNNEL_TOKEN` is absent from
`.env` — which is exactly right for stages 1 and 2.

**Stage 3 — the tunnel, on a domain you control.** Prove `cloudflared`, the
compose network and `http://app:3000` resolution before involving anyone else.
Create a tunnel in *your own* Cloudflare account with a throwaway hostname
(e.g. `library-test.storage-ptec.online` → `http://app:3000`, type HTTP), put
its token in `.env` as `TUNNEL_TOKEN`, then:

```bash
sudo ./deploy/deploy.sh --force     # picks up the tunnel profile automatically
docker compose ps                   # cloudflared Up, app healthy
```

**Stage 4 — `library.ptec.edu.kh`.** Read this before planning it, because the
obvious approach does not work here.

`ptec.edu.kh` is **not** on Cloudflare. Its nameservers are
`dns1/dns2.namecheaphosting.com`, and the zone is administered by the professor,
not by this project. That rules out the normal Cloudflare Tunnel flow: a public
hostname can only be mapped to a zone inside Cloudflare, a `*.cfargotunnel.com`
CNAME is not resolvable from external DNS, and delegating just the `library`
subdomain to Cloudflare is an Enterprise-plan feature.

`library.ptec.edu.kh` is also **live on Vercel right now** (CNAME →
`f201dfbcd9bfb9ee.vercel-dns-017.com`). Whatever replaces it is a real cutover,
not a first configuration.

The route that works, and asks the least of the professor:

1. In **our** Cloudflare account — the one holding `storage-ptec.online` — give
   the tunnel a public hostname on that zone, e.g. `library.storage-ptec.online`
   → `http://app:3000`. This is stage 3 and needs nobody else.
2. Add `library.ptec.edu.kh` as a **Custom Hostname** (Cloudflare for SaaS) in
   that same account, with the stage-3 hostname as the fallback origin.
   Cloudflare then issues the certificate for `library.ptec.edu.kh`. Confirm
   what one custom hostname costs on the current plan before relying on it.
3. Send the professor `docs/DNS-HANDOFF.md`. Their entire action is changing one
   CNAME value — the same record shape that already exists for Vercel.
4. Keep the Vercel deployment in place afterwards. Reverting the CNAME restores
   the old site in minutes, which is the rollback for the cutover itself.

The box changes in none of this. Its tunnel and `TUNNEL_TOKEN` are whatever
stage 3 established; step 2 happens entirely at Cloudflare's edge. That is the
point of proving stages 1–3 first.

The alternative — asking the professor to move `ptec.edu.kh`'s nameservers to
Cloudflare — makes the tunnel work natively and costs nothing, but moves
authoritative DNS for the whole school domain, email included. It is the bigger
ask; the CNAME is deliberately the smaller one.

Finally: delete every router port-forward that previously pointed at the box
(80/443/3000/anything). The tunnel replaces them all. If Vercel or another host
served the domain before, keep it until stage 4 is verified, then remove it.

## 2b. Operations

| Task | Command (on the box, in `/DATA/AppData/ptec-elibrary/app`) |
| --- | --- |
| What is running right now | `./deploy/deploy.sh --status` |
| When is the next check | `systemctl list-timers ptec-elibrary-deploy.timer` |
| Watch deploy logs | `journalctl -u ptec-elibrary-deploy -f` |
| App logs | `docker logs -f ptec-elibrary` |
| Tunnel logs | `docker logs -f ptec-tunnel` |
| Deploy now, don't wait | `sudo ./deploy/deploy.sh --force` |
| Retry an image that failed health | `sudo ./deploy/deploy.sh --force` |
| Pin a version | set `IMAGE_TAG=sha-<full-40-char-sha>` in `.env`, then `--force` |
| Roll back one release | set `IMAGE_TAG` to the previous `sha-…`, then `--force` |
| Return to tracking main | remove `IMAGE_TAG` from `.env`, then `--force` |
| Pause automatic deploys | `sudo systemctl disable --now ptec-elibrary-deploy.timer` |
| Resume them | `sudo systemctl enable --now ptec-elibrary-deploy.timer` |
| Change a runtime secret | edit `.env`, then `docker compose up -d app` (seconds) |

Available tags: `main` (latest from main), `latest`, `sha-<40-char>` per commit,
and `v1.2.3` / `v1.2` for git tags. Browse them at
*GitHub → Packages → ptec-elibrary*.

**Troubleshooting**

| Symptom | Cause and fix |
| --- | --- |
| `pull failed … not logged in to ghcr.io` | The root `docker login` above was not done, or was done as the wrong user. Redo it with `DOCKER_CONFIG=/DATA/AppData/ptec-elibrary/.docker`. |
| Deploy log says "previously failed health checks; skipping" | A bad image is recorded in `/var/lib/ptec-elibrary-deploy/failed-image` so the timer stops reinstalling it. Fix the build, or `--force` to retry deliberately. |
| App healthy, site returns 502 | cloudflared is pointed at the wrong origin. The public hostname must be `http://app:3000` — the compose service name. `localhost:3000` cannot work: cloudflared is in its own container. |
| `docker compose ps` shows no cloudflared | `TUNNEL_TOKEN` is empty in `.env`. The tunnel is a compose profile and `deploy.sh` enables it only when a token is present. |
| Container never reaches `healthy` | `docker logs ptec-elibrary`. Usually a missing runtime env var — the healthcheck fetches `/`, which touches Supabase. |
| Timer runs but nothing happens | Expected. It exits early when the digest is unchanged. Confirm with `journalctl -u ptec-elibrary-deploy -n 20`. |

## 3. What must stay private (never internet-reachable)

| Service | Port | Access policy |
|---|---|---|
| ZimaOS dashboard | 80/443 on the box | LAN or VPN only — never forward |
| SSH | 22 | LAN/VPN only; key auth only (`PasswordAuthentication no`) |
| SMB / file sharing | 445, 139 | LAN only |
| Docker API | 2375/2376 | never expose; no `-H tcp://` |
| Zima Storage admin/API | its port | behind Cloudflare (proxied) like the app; admin UI LAN-only |
| App container | 3000 | internal Docker network; the LAN `ports:` mapping in compose is for debugging and may be removed once the tunnel runs |
| Any database container (if added later) | 5432 etc. | private Docker network only, no `ports:` at all |

**Admin access to the box itself**: use one of, in order of preference —
(1) **Tailscale** on the ZimaOS box (free, 5-min setup, WireGuard-based; SSH +
dashboard over the tailnet), (2) LAN-only from inside the school, (3)
Cloudflare Access in front of a hostname mapped to the dashboard — never a raw
port forward.

The `/admin` area of the *app* is already protected in code (role + MFA). For
an extra edge layer, add a Cloudflare Access application for
`library.ptec.edu.kh/admin*` requiring a staff email — free for small teams,
blocks anonymous traffic before it ever reaches the login form.

## 4. "Is my origin hidden?" checklist

- [ ] `dig library.ptec.edu.kh` returns Cloudflare IPs (104.x / 172.6x) — not the
      school's IP, and no longer Vercel's (`*.vercel-dns-*.com`, 216.198.x / 64.29.x).
- [ ] Old public IP: `curl -m 5 http://<old-public-ip>` times out or refuses.
- [ ] Shodan/Censys search for the school's IP shows no HTTP/SSH/SMB banners
      (re-check a week after removing forwards — scanners lag).
- [ ] Router config has zero port-forward entries for the box.
- [ ] `docker compose ps` shows cloudflared `Up`, app `healthy`.
- [ ] Site loads through the domain with `cf-ray` response header present.

## 5. Docker hardening (already encoded in the compose file)

- Multi-stage build; final image contains only the standalone server —
  no source, no `.git`, **no `.env`** (secrets injected at runtime).
- Container runs as non-root `nextjs` (uid 1001).
- `read_only: true` root filesystem; only `/tmp` and `.next/cache` writable (tmpfs).
- `no-new-privileges` — no setuid escalation.
- Memory-capped (1 GB) so a flood can't OOM the whole box.
- Healthcheck on `/`; `restart: unless-stopped`.
- `NEXT_PUBLIC_*` build args are compile-time public values by definition;
  every real secret (service-role key, API keys) stays runtime-only.

Ongoing:
- [ ] ZimaOS itself needs updating; the app image updates itself via the deploy timer.
- [ ] Strong unique ZimaOS admin password (+ MFA if the ZimaOS version supports it).
- [ ] Disable ZimaOS services not in use (media servers, remote-access helpers).
- [ ] UPS for the box if possible — PDFs are served from Zima Storage on this hardware.

## 6. ZimaOS backup reality check

The **database and auth are on hosted Supabase** — Supabase's backups cover
them (verify per SECURITY-OPS.md §3). What lives *only* on the ZimaOS box:

- **Zima Storage files (all PDFs + covers)** — the single point of failure.
  Nightly `restic`/`rsync` snapshot to a second disk **and** an off-device copy
  (R2 bucket or another machine). 7 daily + 4 weekly + 6 monthly.
- `.env` — keep an encrypted copy in a password manager.
- This repo — it's on GitHub; nothing to do.

Restore drill (each semester): restore one PDF snapshot to a temp dir, open 3
random files; rebuild the app container from a clean clone + `.env` copy and
confirm `/` serves.

## 7. Emergency rollback

Tunnel or box dies and you need the site back fast:

1. **Tunnel broken, box fine**: `docker compose restart cloudflared`; check
   Zero Trust → Tunnels status. Tunnel tokens don't expire; re-paste into
   `.env` if it was rotated.
2. **Box down entirely**: deploy the same repo to Vercel (it remains fully
   Vercel-compatible — `output: standalone` is ignored there), set env vars,
   point Cloudflare DNS at the Vercel deployment. PDFs on Zima Storage will
   404 until the box returns, but browsing/search/auth/covers-on-R2 keep working.
3. **Roll back a bad app deploy**: `deploy.sh` already rolls back on its own
   when a new image fails its healthcheck. To undo a deploy that *is* healthy
   but wrong, set `IMAGE_TAG=sha-<last-good-40-char-sha>` in `.env` and run
   `sudo ./deploy/deploy.sh --force`. No rebuild, no git checkout on the box.
4. Site under attack: follow DDOS-PROTECTION.md §4 (Under Attack Mode →
   `DDOS_MODE=true` → `docker compose up -d` to restart with the new env).

Note: with self-hosting, emergency env switches apply via
`docker compose up -d app` (container recreate, seconds) — no marketplace
redeploy involved.
