# Pointing `library.ptec.edu.kh` at the college's own server

**For the administrator of the `ptec.edu.kh` domain.**
**One DNS record changes. Nothing else on the domain is touched.**

The PTEC e-Library currently runs on Vercel, an external hosting service. It is
moving to a server inside the college. The library keeps the same address,
`library.ptec.edu.kh`, so nothing changes for students — the address simply
needs to point at the college server instead of at Vercel.

Traffic still goes through Cloudflare, which provides the public address, the
HTTPS certificate and DDoS protection. The college server only makes outbound
connections; nothing from the internet connects to it directly.

## The change

`library.ptec.edu.kh` is a CNAME today, in the Namecheap/cPanel DNS for
`ptec.edu.kh`. Only its **value** changes:

| | Value |
| --- | --- |
| Record | `library` (type **CNAME**) |
| Current value | `f201dfbcd9bfb9ee.vercel-dns-017.com` |
| **New value** | *(the student will send you the exact target — it ends in `.storage-ptec.online`)* |
| TTL | Automatic, or 5 minutes for the switchover |

Nothing else changes: no A record, no MX record, no nameservers. Email, the
main `ptec.edu.kh` website and every other subdomain are unaffected.

### Checklist (copy-paste)

- [ ] Wait for the student's go-ahead + the exact new CNAME target
- [ ] In cPanel/Namecheap DNS for `ptec.edu.kh`, open the `library` CNAME
- [ ] Set **TTL to 5 minutes** first (if it isn't already), save
- [ ] Change the **value** to the target the student sent
      (ends in `.storage-ptec.online`) — record type stays CNAME
- [ ] Tell the student it's done; they verify within ~10 minutes
- [ ] Keep the TTL at 5 minutes — it is what makes the undo (below) fast,
      and it stays the emergency lever afterwards
- [ ] Keep this document; the old value below is the rollback

## Please read before making the change

**This switches a service that is currently live.** The moment the record
updates, visitors stop reaching the Vercel copy and start reaching the college
server. Please make the change only when the student confirms the server is
ready and has been tested.

**To undo it**, set the record back to `f201dfbcd9bfb9ee.vercel-dns-017.com`.
The Vercel deployment is left in place and keeps working, so reverting restores
the current site within minutes. Please keep this document until the new setup
has run for a week or two.

## What you do *not* need to do

- No nameserver change — `ptec.edu.kh` stays on Namecheap.
- No Cloudflare account, and no access to one.
- No software to install, no port to open, no firewall or router change.
- No certificate to buy or renew — it is issued and renewed automatically.
- No change to school email or any other record.

## Why the value points at another domain

The college server connects out to Cloudflare through `storage-ptec.online`,
a domain the student administers and which already serves the library's file
storage. Cloudflare is configured there to answer for `library.ptec.edu.kh`
and to issue its certificate. The visitor only ever sees
`https://library.ptec.edu.kh`.

## If you would rather not do this

An alternative is to move `ptec.edu.kh`'s nameservers to Cloudflare, after
which the library could be connected without involving another domain. It is
free, but it moves authoritative DNS for the **whole** domain, school email
included, so the single CNAME above is deliberately the smaller and safer ask.

---

*Questions: ask the student who sent you this, or see
`docs/ZIMAOS-DEPLOYMENT.md` in the project repository.*
