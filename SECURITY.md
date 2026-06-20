# PTEC e-Library Admin Security Hardening

This document outlines the security controls protecting the PTEC Admin Area. Since administrators access the panel from various locations (home, mobile, school networks), we use a Zero Trust architecture rather than static IP whitelisting.

---

## 1. Security Architecture Overview

The admin area is protected by multiple layers of defense (Defense in Depth):

1. **Cloudflare Access (Zero Trust)**: Requires an email OTP from an approved administrator before the login page even loads.
2. **Cloudflare Rate Limiting**: Protects against brute-force password guessing.
3. **Turnstile CAPTCHA**: Native bot protection on the login form (already implemented).
4. **Edge Middleware**: Runs at the edge to refresh sessions and redirect unauthenticated users away from `/admin/*`.
5. **TOTP MFA (AAL2)**: Enforces Two-Factor Authentication via an Authenticator App after a successful password login.
6. **Server-Side Authorization**: Every Server Action and Route Handler strictly verifies the user's `admin` role and AAL2 status via the `requireAdmin()` helper.
7. **Database RLS & Triggers**: Column-level revokes and PostgreSQL triggers prevent any user (even admins) from illegitimately escalating their privileges or tampering with the `role` and `is_super_admin` columns.

---

## 2. Cloudflare Rate Limiting (Task 5)

We use Cloudflare Rate Limiting to prevent brute-force attacks against the admin login endpoint.

### Recommended Rule Configuration
- **Rule Name**: `Admin Login Brute-Force Protection`
- **Match**: `(http.request.uri.path eq "/admin/login" and http.request.method eq "POST")`
  *(Note: Supabase auth is primarily called client-side to their API, so you should also consider rate limiting the Supabase project endpoints if applicable, but Cloudflare protects our hosted frontend route).*
- **Threshold**: 5 requests per 10 minutes per IP
- **Action**: Block for 15 minutes

### Setup Steps in Cloudflare:
1. Log into the [Cloudflare Dashboard](https://dash.cloudflare.com) and select your domain.
2. Go to **Security** → **WAF** → **Rate limiting rules**.
3. Click **Create rule**.
4. Set the match criteria as defined above.
5. Set the action to **Block** and duration to **15 minutes**.
6. Save and Deploy.

> **Note**: In-memory rate limiting was previously used, but Vercel's serverless architecture resets memory state during cold starts. Cloudflare provides a persistent, edge-level rate limit. 
> 
> **Optional App-Level Rate Limiting**: If you wish to implement rate limiting in the application code, you must use a persistent store like **Upstash Redis**. You would need to set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` in Vercel, but Cloudflare is the primary and recommended control.

---

## 3. Cloudflare Access / Zero Trust (Task 6)

Cloudflare Access verifies the identity of the person attempting to reach the `/admin` path before they hit Vercel.

### 3.1 Proxy the Domain Through Cloudflare
1. Ensure your domain is added to Cloudflare and the nameservers are pointed to Cloudflare.
2. In the Cloudflare Dashboard, go to **DNS** → **Records**.
3. Ensure the A or CNAME record for your domain (e.g., `library.ptec.edu.kh`) is "orange-clouded" (Proxied).
4. Go to **SSL/TLS** → **Overview**.
5. Set the encryption mode to **Full (strict)**. This is required because Vercel provisions its own SSL certificates for custom domains.

### 3.2 Create a Cloudflare Access Application
1. Go to **Zero Trust** in the Cloudflare Dashboard.
2. Navigate to **Access** → **Applications**.
3. Click **Add an application** and select **Self-hosted**.
4. **Application Configuration**:
   - **Application name**: `PTEC Admin Panel`
   - **Session Duration**: `24 hours`
   - **Application domain**: Select your domain and enter `admin` in the path (e.g., `library.ptec.edu.kh/admin`).
5. **Authentication**:
   - Under Identity Providers, ensure **One-time PIN** is selected. (This sends an email code to the user).
6. **Policies**:
   - Add a new policy.
   - **Policy name**: `Approved Admin Emails`
   - **Action**: `Allow`
   - **Include**: Select `Emails` and add the email addresses of your administrators (e.g., `admin@ptec.edu.kh`). Alternatively, if all admins use the same domain, use `Emails Ending In` (e.g., `@ptec.edu.kh`).
7. Save the application.

> **Why this matters**: Even if an attacker obtains an administrator's password, they cannot reach the login page without first receiving and entering an OTP sent to the administrator's email inbox.

### 3.3 Bypass Rules (Optional)
If your application makes server-to-server API calls to `/admin/*` from outside the Cloudflare Access session, you may need to add a bypass rule. However, since PTEC's admin API routes (`/api/admin/upload`, etc.) are called directly from the admin's browser (which already has the Access token), no bypass rules are typically needed.

---

## 4. Testing Each Security Control

Follow these steps to manually verify the security posture:

1. **Non-admin cannot call admin actions**: 
   - Sign in as a `reader` user.
   - Open browser DevTools (Network tab).
   - Copy a legitimate Server Action request (from a past admin session or construct one).
   - Replay it with the reader's cookies.
   - **Verify**: The server responds with a 401/403 error.

2. **AAL1 sessions blocked by actions**: 
   - Sign in as an admin but forcibly skip the MFA verify step (if possible via URL manipulation).
   - Attempt to call an admin Server Action.
   - **Verify**: The action throws an error indicating MFA verification is required.

3. **AAL1 sessions blocked by layout**: 
   - Navigate to `/admin`.
   - **Verify**: You are immediately redirected to `/admin/mfa/enroll` (if you haven't set up MFA) or `/admin/mfa/verify` (if you have).

4. **Middleware blocks unauthenticated**: 
   - Clear your browser cookies or open an Incognito window.
   - Navigate directly to `/admin` or `/admin/manage`.
   - **Verify**: You are redirected to `/admin/login`.

5. **Role column locked in DB**: 
   - Open the Supabase SQL editor.
   - Run a query as an authenticated user: `UPDATE profiles SET role = 'admin' WHERE id = '<your-user-id>';`
   - **Verify**: The database rejects the update.

6. **`is_super_admin` locked**: 
   - Similar to above, attempt: `UPDATE profiles SET is_super_admin = true WHERE id = '<your-user-id>';`
   - **Verify**: The database rejects the update via the trigger.

7. **Login still works**: 
   - Complete the full login flow with the Turnstile CAPTCHA.
   - **Verify**: You can successfully log in.

8. **MFA enrollment works**: 
   - After your first login, you will be prompted to enroll in TOTP.
   - Scan the QR code with Google Authenticator or Authy.
   - Enter the 6-digit code.
   - **Verify**: You gain access to the admin panel.

9. **Cloudflare Access blocks unauthorized email**: 
   - Open an Incognito window and navigate to `/admin`.
   - You will see the Cloudflare Access prompt.
   - Enter an email that is NOT in the approved policy.
   - **Verify**: Cloudflare blocks access and does not send a code.

10. **Rate limiting works**: 
    - Make 6 rapid POST requests to `/admin/login` from the same IP.
    - **Verify**: The 6th request is blocked by Cloudflare (HTTP 429).
