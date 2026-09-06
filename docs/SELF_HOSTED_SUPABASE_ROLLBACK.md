# Self-Hosted Supabase — Rollback Runbook

_How to put `library.ptec.edu.kh` back on Supabase Cloud, and how to recover
the self-hosted database from its own backups. Written before cutover;
rehearsed on staging; kept current for 30 days after cutover._

> Fast path for the app tier: `sudo ./deploy/cutover-selfhost-env.sh --rollback`
> restores `.env` from `.env.cloud` (Cloud URL, `sb_*` keys, pinned `IMAGE_TAG`,
> no `COMPOSE_FILE`), then `sudo ./deploy/deploy.sh --force`.

## 1. When to roll back

Roll back **immediately**, without debugging, if within the first hours any of
these hold: password login fails for staff, Google OAuth fails, PDFs do not
stream, `/api/health` stays 503, or the tunnel hostname is unreachable for
more than 10 minutes. Debug on staging afterwards. Rolling back is cheap
because nothing on Cloud was changed.

## 2. What rollback does NOT do

- It does not carry writes made on the self-hosted stack back to Cloud. Any
  account created, comment posted, reading progress saved or admin edit made
  after T-0 exists only on the box. Before rolling back, decide whether that
  window is small enough to lose (usually yes within the first hour) or
  whether to export it (`pg_dump --data-only -t <table>` from `supabase-db`)
  and replay it by hand afterwards.
- It does not stop or destroy the self-hosted stack. Leave it running; the
  data is your record of the failed attempt.

## 3. Roll the application back to Cloud

Inputs: `/DATA/AppData/ptec-elibrary/app/.env.cloud` (saved at T-10, with
`IMAGE_TAG=sha-<last Cloud-built image>`), the Cloud project still running.

```bash
cd /DATA/AppData/ptec-elibrary/app
sudo scripts/migration/rollback.sh --dry-run   # shows the env keys that change
sudo scripts/migration/rollback.sh             # swaps env, reinstalls the Cloud-built image, waits for health
```

Then, by hand:

1. GitHub → Variables: `NEXT_PUBLIC_SUPABASE_URL` back to
   `https://<ref>.supabase.co`; restore the `SUPABASE_DB_URL` secret so
   `migrate.yml` resumes applying to Cloud. The next push to `main` builds a
   Cloud-shaped image again; until then `IMAGE_TAG` pins the old one and
   `deploy.sh` will not move (remove the pin once a new Cloud build exists).
2. Re-enable signups on Cloud if they were paused at T-30.
3. Verify: `scripts/migration/verify-api.sh` with
   `EXPECT_SUPABASE_URL=https://<ref>.supabase.co`; login; `/api/health`.
4. Tell users to sign in again (the cookie name flips back).
5. Vercel standby: if its env was repointed, point it back.

Why the image matters: `NEXT_PUBLIC_SUPABASE_URL` is compiled into the
browser bundle. Restarting the self-hosted-built image with Cloud env would
still send every browser to the self-hosted hostname. `rollback.sh` therefore
pins and reinstalls the last Cloud-built image; the env swap alone is not
enough.

## 4. Recover the self-hosted database from a backup

For a corrupted or lost self-hosted database (not a return to Cloud):

```bash
cd /DATA/AppData/ptec-elibrary/app/infra/supabase
docker compose stop auth rest realtime meta studio        # keep db up if it is healthy
# fresh data directory only if the volume itself is damaged:
#   docker compose down && mv volumes-or-SUPABASE_DATA_DIR{,.broken} && docker compose up -d db auth && wait for auth healthy
DUMP=/DATA/backups/supabase/db-<ts>.dump[.enc]
[ "${DUMP##*.}" = enc ] && openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in "$DUMP" -out /tmp/db.dump -pass env:BACKUP_PASSPHRASE || cp "$DUMP" /tmp/db.dump
docker exec -i supabase-db pg_restore -U supabase_admin -d postgres --clean --if-exists --no-owner --role=supabase_admin < /tmp/db.dump
docker compose up -d
./scripts/healthcheck.sh
rm -f /tmp/db.dump
```

Expect "already exists" errors for objects GoTrue's own migrations created —
`pg_restore` continues past them. `restore-test.sh` does exactly this into a
throwaway container every Sunday, so the procedure is proven weekly.

## 5. Recover from a lost box entirely

1. New box: `deploy/install.sh` for the app (docs/ZIMAOS-DEPLOYMENT.md), then
   `infra/supabase/scripts/install.sh` with `.env` restored from the password
   manager (`SECRET-REGISTRY.md`).
2. Restore the newest dump from the off-site copy of `/DATA/backups/supabase`
   (§4). The pgsodium key in the `db-config` volume is not needed for this
   schema (no vault usage) — a fresh one is fine.
3. Re-create the tunnel connector token (Cloudflare Zero Trust) if the old box
   is gone; the public hostname stays.
4. `verify-auth.sh`, `verify-api.sh`, one manual login.

## 6. Rehearsal record

| Date | What was rehearsed | Result | Notes |
|---|---|---|---|
| | `rollback.sh --dry-run` on staging | | |
| | §4 restore into a fresh stack | | |
