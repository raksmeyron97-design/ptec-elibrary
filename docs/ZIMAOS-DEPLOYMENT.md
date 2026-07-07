# PTEC e-Library — ZimaOS Deployment & Origin Protection

How to run the app on a self-hosted ZimaOS box **without exposing the box to
the internet**. Companion to `DDOS-PROTECTION.md` (edge rules, rate limits,
emergency mode) and `SECURITY-OPS.md` (monitoring, backups).
Last reviewed: 2026-07-07.

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

## 2. Setup (one-time, ~30 minutes)

1. **DNS**: in Cloudflare, `library.ptec.edu.kh` must be **Proxied**
   (orange cloud). Delete any A record pointing at the school's public IP once
   the tunnel works.
2. **Tunnel**: Cloudflare Zero Trust → Networks → Tunnels → *Create tunnel*
   (Cloudflared connector). Copy the token into `.env` as `TUNNEL_TOKEN`.
   Add a Public Hostname: `library.ptec.edu.kh` → `http://app:3000`.
3. **Deploy** on the ZimaOS box:
   ```bash
   git clone <repo> && cd e-library-ptec
   cp .env.example .env   # fill in real values (never commit)
   docker compose --profile tunnel up -d --build
   ```
4. **Remove old exposure**: delete every router port-forward that previously
   pointed at the box (80/443/3000/anything). The tunnel replaces them all.
5. If Vercel (or another host) previously served the domain, keep it as a
   fallback only until the tunnel is verified, then remove its DNS entry.

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

- [ ] `dig library.ptec.edu.kh` returns Cloudflare IPs (104.x / 172.6x), not the school's IP.
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
- Healthcheck on `/home`; `restart: unless-stopped`.
- `NEXT_PUBLIC_*` build args are compile-time public values by definition;
  every real secret (service-role key, API keys) stays runtime-only.

Ongoing:
- [ ] Keep ZimaOS and images updated: `docker compose pull && docker compose up -d --build` monthly.
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
confirm `/home` serves.

## 7. Emergency rollback

Tunnel or box dies and you need the site back fast:

1. **Tunnel broken, box fine**: `docker compose restart cloudflared`; check
   Zero Trust → Tunnels status. Tunnel tokens don't expire; re-paste into
   `.env` if it was rotated.
2. **Box down entirely**: deploy the same repo to Vercel (it remains fully
   Vercel-compatible — `output: standalone` is ignored there), set env vars,
   point Cloudflare DNS at the Vercel deployment. PDFs on Zima Storage will
   404 until the box returns, but browsing/search/auth/covers-on-R2 keep working.
3. **Roll back a bad app deploy**: `git checkout <last-good-sha> &&
   docker compose --profile tunnel up -d --build` (or keep the previous image
   tagged: `docker tag ptec-elibrary:latest ptec-elibrary:prev` before builds).
4. Site under attack: follow DDOS-PROTECTION.md §4 (Under Attack Mode →
   `DDOS_MODE=true` → `docker compose up -d` to restart with the new env).

Note: with self-hosting, emergency env switches apply via
`docker compose up -d app` (container recreate, seconds) — no marketplace
redeploy involved.
