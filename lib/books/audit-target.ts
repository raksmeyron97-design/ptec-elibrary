// The guard every read-only cataloguing worksheet runs first (SEO audit
// 2026-10, WI-7/7b). These scripts read with the SERVICE ROLE — book_pages is
// service-role only — so pointing one at production is a decision (owner
// decision O-5), never an accident of whichever .env.local is on the laptop.

const LOCAL_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

export function auditTarget(supabaseUrl: string, argv: readonly string[]): { host: string; allowed: boolean; reason: string } {
  let host = "";
  try {
    host = new URL(supabaseUrl).host;
  } catch {
    return { host: "(invalid)", allowed: false, reason: "NEXT_PUBLIC_SUPABASE_URL is not a URL" };
  }
  if (LOCAL_HOST.test(host)) return { host, allowed: true, reason: "local stack" };
  if (argv.includes("--production")) return { host, allowed: true, reason: "--production given (O-5)" };
  return { host, allowed: false, reason: "a non-local database needs --production, which owner decision O-5 governs" };
}
