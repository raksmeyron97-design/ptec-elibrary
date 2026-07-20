import { describe, expect, it } from "vitest";
import { checkDestinationUrl, isSafeDestinationUrl } from "./url-safety";

describe("checkDestinationUrl", () => {
  it("accepts a relative internal path", () => {
    const result = checkDestinationUrl("/books/some-slug");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("internal");
  });

  it("rejects an empty value", () => {
    expect(checkDestinationUrl("").ok).toBe(false);
    expect(checkDestinationUrl(null).ok).toBe(false);
    expect(checkDestinationUrl(undefined).ok).toBe(false);
  });

  it("rejects protocol-relative URLs (open-redirect trick)", () => {
    const result = checkDestinationUrl("//evil.example.com/phish");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("protocol_relative");
  });

  it("rejects javascript: and other unsafe schemes", () => {
    expect(checkDestinationUrl("javascript:alert(1)").ok).toBe(false);
    expect(checkDestinationUrl("data:text/html,<script>alert(1)</script>").ok).toBe(false);
    expect(checkDestinationUrl("vbscript:msgbox(1)").ok).toBe(false);
  });

  it("rejects plain http:// (only https allowed for absolute URLs)", () => {
    const result = checkDestinationUrl("http://library.ptec.edu.kh/books");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unsafe_scheme");
  });

  it("accepts an https URL on the site's own domain", () => {
    const result = checkDestinationUrl("https://library.ptec.edu.kh/books/foo");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.kind).toBe("internal");
  });

  it("rejects an https URL on a non-allowlisted external domain", () => {
    const result = checkDestinationUrl("https://totally-not-a-scam.example.com/win");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not_allowlisted");
  });

  it("rejects an unparseable string", () => {
    const result = checkDestinationUrl("not a url at all!!");
    expect(result.ok).toBe(false);
  });

  it("isSafeDestinationUrl mirrors .ok", () => {
    expect(isSafeDestinationUrl("/books")).toBe(true);
    expect(isSafeDestinationUrl("javascript:alert(1)")).toBe(false);
  });
});
