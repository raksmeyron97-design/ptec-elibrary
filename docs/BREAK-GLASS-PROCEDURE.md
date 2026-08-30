# Break-Glass Admin Procedure

_Created 2026-08-29, closing risk F1 / R10 (bus factor 1: a single
admin-capable account means one lost password, phone, or person locks the
admin panel). Companions: `RUNBOOKS.md` §I9/§M12/§M17,
`SUPABASE-RESTORE-GUIDE.md` §4._

## What the break-glass account is

A second `super_admin` account that is **never used for daily work**. It
exists only so that losing the primary admin (forgotten credentials, lost MFA
device, departure, incapacitation, account compromise requiring the primary
to be frozen) does not lock the library out of its own admin panel. Dormancy
is the design: its `last_sign_in_at` staying empty is a healthy signal, and
any unexpected sign-in is a Sev 1 (§4).

## 1. Provisioning (once, ~15 minutes)

1. Pick a dedicated address the institution controls (an alias like
   `library-breakglass@…` — not a personal inbox, and not the primary
   admin's).
2. On a trusted machine with the repo and a production `.env`:

   ```bash
   node scripts/ops/create-breakglass-admin.mjs --email <address>            # report current state
   node scripts/ops/create-breakglass-admin.mjs --email <address> --create   # provision
   ```

   The script creates the auth user (email pre-confirmed), promotes the
   profile to `super_admin`, and prints the generated password **once**. It
   refuses to touch an existing account — password resets belong to the
   normal flow, not scripts.
3. Immediately transcribe the URL + email + password onto paper, clear the
   terminal (`clear && history -d $((HISTCMD-1))` if the command line held
   anything sensitive), and proceed to §2.
4. Verify without signing in: re-run the script **without** `--create` — it
   must report `✓ break-glass ready` and at least 2 admin-capable profiles.

Do **not** sign in during provisioning. MFA (AAL2 is enforced for the admin
panel) is deliberately left un-enrolled: enrollment happens at activation
time, which keeps the sealed envelope sufficient on its own — a sealed TOTP
seed ages badly and tempts phone-based storage.

## 2. Storage (two independent copies)

| Copy | Where | Access |
|---|---|---|
| **Sealed envelope** (primary) | Signed and dated across the seal; stored in the director's locked cabinet at the college | DIR physically controls it; opening requires §3 authorization |
| **Password-manager emergency access** (secondary) | The ops password manager's emergency-access / recovery-contact feature, granting the director's account access after its waiting period | Survives fire/flood at the college; useless without the DIR-side approval |

`BACKUP_PASSPHRASE` (DB/file backup encryption) **must** be recoverable
through the same two channels — an unreadable backup and a locked admin
panel are the same disaster. Add it to the envelope (separate sheet) and to
the password manager's emergency vault.

Record in the quarterly access-review sheet: seal date, envelope location,
who holds emergency access. The envelope's existence is not a secret; its
contents are.

## 3. Activation (breaking the glass)

**Authorization**: any of — (a) the library director approves, (b) the
web-team lead is unreachable > 24 h during a Sev 1, (c) the primary admin
account is confirmed compromised (§I9 — activate to freeze the primary).
Whoever opens the envelope records who/when/why (a message to the ops
Telegram chat is sufficient contemporaneous record).

1. Open the envelope. Sign in at `/admin/login`.
2. The panel forces MFA enrollment (`/admin/mfa`) — enroll on the phone of
   the person activating, note whose device in the activation record.
3. Do the minimum the incident requires (typically: create/repair the
   primary admin per §M17, or freeze it per §I9). Every action lands in
   `admin_audit_log` under the break-glass identity — that is the point;
   do not share the account.
4. Announce in the ops channel that break-glass is active, even after the
   fact.

## 4. Monitoring

- An unexpected sign-in of the break-glass account (no activation record) is
  a **Sev 1** — treat as §I9 admin compromise: the envelope or vault leaked.
  The privilege-change / admin-auth-anomaly alerts (`ALERT-CATALOG.md`)
  cover its audit-log activity like any admin.
- Quarterly (§M4/§M12): run
  `node scripts/ops/create-breakglass-admin.mjs --email <address>` — confirm
  `✓ break-glass ready`, `last_sign_in_at` still "never" (or matching a
  recorded activation), and the envelope's seal intact.

## 5. After every activation (same week)

1. Rotate the break-glass password: sign in as the break-glass user →
   normal password change → new sealed envelope + updated emergency vault;
   or retire the address and provision a fresh one (§1).
2. Un-enroll the activation MFA factor after the new envelope is sealed
   (dormant accounts carry no live factors).
3. Rotate anything else the incident exposed (`SECRET-REGISTRY.md`).
4. PIR (`docs/drills/PIR-TEMPLATE.md`) if the activation was incident-driven.
