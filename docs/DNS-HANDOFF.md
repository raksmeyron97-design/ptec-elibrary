# Connecting `library.ptec.edu.kh` to the PTEC e-Library server

**For the administrator of the `ptec.edu.kh` domain.**

The PTEC e-Library is a free digital library for Phnom Penh Teacher Education
College. It now runs on a server inside the college. To let students reach it
at `library.ptec.edu.kh`, the server needs a **Cloudflare Tunnel** — an
outbound-only connection from the college server to Cloudflare. Cloudflare
handles the public address, the HTTPS certificate and the DDoS protection; the
college server never accepts a connection from the internet directly.

Because `ptec.edu.kh` lives in your Cloudflare account, the tunnel has to be
created there. It takes about five minutes, all in the Cloudflare dashboard.

## What to configure

| Step | Where | Value |
| --- | --- | --- |
| 1. Create the tunnel | Zero Trust → Networks → Tunnels → **Create a tunnel** → *Cloudflared* | Name: `ptec-elibrary` |
| 2. Add a public hostname | The new tunnel → **Public Hostname** tab → *Add a public hostname* | Subdomain: `library` · Domain: `ptec.edu.kh` · Type: **HTTP** · URL: `app:3000` |
| 3. Send the token | The tunnel's install screen shows a connector token (a long string after `--token`) | Send it privately to the student running the server |

Cloudflare creates the required DNS record automatically when you add the
public hostname in step 2. **You do not need to hand-edit a CNAME.** The record
it creates is proxied (orange cloud), which is what makes the protection work.

The URL in step 2 is `app:3000` — that is a name inside the college server's
own private network, not a public address. It is correct as written.

## What you do *not* need to do

- No software to install, on any machine of yours.
- No firewall or router change, and no port to open — the tunnel only makes
  outbound connections.
- No certificate to buy or renew; Cloudflare issues and renews it.
- No change to email, the main website, or any other `ptec.edu.kh` record.

## How to undo it

Delete the tunnel: Zero Trust → Networks → Tunnels → `ptec-elibrary` → Delete.
That removes the connection and the DNS record Cloudflare created with it, in
one step. Nothing else on the domain is affected.

## About the token

The connector token is a credential. Anyone holding it can serve traffic on
`library.ptec.edu.kh`, so please send it through a private channel — a direct
message or a password manager rather than plain email. If it is ever exposed,
you can rotate it from the same tunnel screen at any time; the old one stops
working immediately.

---

*Questions about what the service does or what it stores: see the project's
`docs/ZIMAOS-DEPLOYMENT.md`, or ask the student who sent you this document.*
