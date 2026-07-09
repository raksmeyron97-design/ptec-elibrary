// scripts/get-gmail-refresh-token.mjs
//
// One-time local helper to obtain a Gmail API OAuth2 refresh token for the
// admin inbox reply system (lib/gmail.ts). Run this once on your own
// machine — it is NOT part of the deployed app and never runs in production.
//
// ── Before running ──────────────────────────────────────────────────────
// 1. In Google Cloud Console (console.cloud.google.com):
//      a. Create (or pick) a project, then enable the "Gmail API"
//         (APIs & Services → Library → search "Gmail API" → Enable).
//      b. APIs & Services → OAuth consent screen:
//           - User type: External (or Internal if you have Workspace).
//           - Add the Gmail address you'll send from (ADMIN_GMAIL_ADDRESS)
//             as a test user if the app is in "Testing" status.
//      c. APIs & Services → Credentials → Create Credentials → OAuth client ID:
//           - Application type: "Desktop app"
//           - Note the generated Client ID and Client Secret.
// 2. Set these in your shell (or a local .env you source manually):
//      export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
//      export GOOGLE_CLIENT_SECRET="..."
// 3. Run:  node scripts/get-gmail-refresh-token.mjs
// 4. A URL is printed — open it, sign in as ADMIN_GMAIL_ADDRESS, and grant
//    the "Send email on your behalf" permission. You'll be redirected back
//    to localhost and the script will print your GOOGLE_REFRESH_TOKEN.
// 5. Paste GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
//    into your .env (never commit them).
//
// The requested scope is the minimum needed — gmail.send only. This app
// never reads, lists, or modifies the Gmail inbox itself.

import http from "node:http";
import { google } from "googleapis";

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = ["https://www.googleapis.com/auth/gmail.send"];

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in the environment.\n" +
    "Set them first, e.g.:\n" +
    '  export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"\n' +
    '  export GOOGLE_CLIENT_SECRET="..."\n' +
    "See the comment header of this script for the full Google Cloud setup steps."
  );
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline", // required to receive a refresh_token
  prompt: "consent", // forces a refresh_token even on repeat runs
  scope: SCOPES,
});

console.log("\nOpen this URL in your browser and sign in as your library Gmail account:\n");
console.log(authUrl);
console.log(`\nWaiting for the redirect to ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, REDIRECT_URI);
    if (url.pathname !== "/oauth2callback") {
      res.writeHead(404).end();
      return;
    }

    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (error || !code) {
      res.writeHead(400, { "Content-Type": "text/plain" }).end(`Authorization failed: ${error ?? "no code returned"}`);
      console.error("Authorization failed:", error ?? "no code returned");
      server.close();
      process.exit(1);
    }

    const { tokens } = await oauth2Client.getToken(code);

    res.writeHead(200, { "Content-Type": "text/plain" }).end(
      "Authorization complete — you can close this tab and return to the terminal."
    );

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token was returned. This usually means you've already " +
        "authorized this app before. Revoke access at " +
        "https://myaccount.google.com/permissions and run this script again."
      );
      server.close();
      process.exit(1);
    }

    console.log("\nSuccess! Add these to your .env:\n");
    console.log(`GOOGLE_CLIENT_ID="${clientId}"`);
    console.log(`GOOGLE_CLIENT_SECRET="${clientSecret}"`);
    console.log(`GOOGLE_REFRESH_TOKEN="${tokens.refresh_token}"`);
    console.log("");

    server.close();
    process.exit(0);
  } catch (err) {
    console.error("Error exchanging code for tokens:", err);
    res.writeHead(500).end("Error exchanging code for tokens — see terminal.");
    server.close();
    process.exit(1);
  }
});

server.listen(PORT);
