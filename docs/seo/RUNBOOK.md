# SEO runbook: steps outside the repository

Things this programme cannot change from code. Phase 0 (2026-09-30) opened the
file with the checks its findings need; Phase 7.4 completes it (Search Console,
Bing, the PTEC main-site menu, the old Google Site, Google Business Profile).

---

## F1: find where the stale `/books` came from

Production served the current `/books` on 40 of 40 requests on 2026-09-30, and
nothing in our stack can hold HTML for weeks (`AUDIT-VERIFICATION.md` F1). Two
hypotheses remain. Each takes a few minutes to settle.

**A. The auditor's side.** Ask for the raw response headers of the stale
response. Every response from this origin carries `cf-ray`, `date` and
`cf-cache-status` (`DYNAMIC` for `/books`). A copy without them, or with a
`date` from before 2026-09-12, did not come from us.

**B. A second origin behind the hostname.**

1. Cloudflare Zero Trust → Networks → Tunnels → the tunnel serving
   `library.ptec.edu.kh` → **Connectors**. Expect exactly the ZimaOS box. Any
   other connector (another IP or hostname, or an old `cloudflared` version) is
   a second origin: find it and stop it.
2. On the box, list what runs from the app image:

   ```sh
   docker ps --format '{{.ID}}  {{.Image}}  {{.CreatedAt}}  {{.Ports}}' \
     | grep -E 'ptec-elibrary|:13000|:3000'
   ```

   Expect exactly one app container, from the image the latest deploy pulled.
   A second container from an older image, or anything else answering on the
   tunnel's target port (`13000`, per the `docker-compose.yml` comment), is the
   stale origin.
3. Once one of these is settled, record the answer in
   `AUDIT-VERIFICATION.md` F1.

From Phase 1 onward, a build-fingerprint response header will make any stale
copy attributable in one request.

## N7: is ISR memory-only in production?

The container's root filesystem is read-only (`docker-compose.yml`
`read_only: true`; only `/tmp` and `/app/.next/cache` are writable), and Next's
file-system ISR cache writes pages under `.next/server/app`. To confirm, check
the container log for write failures:

```sh
docker logs --since 24h <app-container> 2>&1 | grep -iE 'EROFS|read-only file system|ENAMETOOLONG|prerender cache' | head
```

Write failures mean ISR entries live only in the in-memory LRU and are lost on
every restart, which bears on Phase 6.

## Cloudflare: before anyone adds an HTML cache rule

Today Cloudflare stores **no** HTML (`cf-cache-status: DYNAMIC` on every
page). ISR pages leave the origin with
`s-maxage=<revalidate>, stale-while-revalidate=31535940`, about **one year**.
If a "Cache Everything" or HTML cache rule is ever added, Cloudflare would be
entitled to serve a year-old page while it revalidates: exactly the F1 symptom,
this time for real. Any such rule must set an explicit Edge TTL and
**ignore** the origin's `stale-while-revalidate`, and `/books`, `/search` and
every other `private, no-store` page must stay excluded. Purge on deploy
(Phase 7.4).
