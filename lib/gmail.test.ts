import { describe, it, expect } from "vitest";
import { encodeHeader, sanitizeHeaderValue, buildRawMessage } from "./gmail";

describe("sanitizeHeaderValue", () => {
  it("strips CR/LF to prevent header injection", () => {
    expect(sanitizeHeaderValue("hello\r\nBcc: attacker@evil.com")).toBe("hello Bcc: attacker@evil.com");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeHeaderValue("  hi  ")).toBe("hi");
  });
});

describe("encodeHeader", () => {
  it("leaves ASCII-only values untouched", () => {
    expect(encodeHeader("Contact form update")).toBe("Contact form update");
  });

  it("RFC 2047-encodes non-ASCII (Khmer) subjects", () => {
    const encoded = encodeHeader("សំណួរអំពីសៀវភៅ");
    expect(encoded.startsWith("=?UTF-8?B?")).toBe(true);
    expect(encoded.endsWith("?=")).toBe(true);
    const decoded = Buffer.from(encoded.slice("=?UTF-8?B?".length, -2), "base64").toString("utf-8");
    expect(decoded).toBe("សំណួរអំពីសៀវភៅ");
  });

  it("strips CR/LF before encoding", () => {
    const encoded = encodeHeader("line1\r\nline2");
    expect(encoded).not.toContain("\r");
    expect(encoded).not.toContain("\n");
  });
});

describe("buildRawMessage", () => {
  const base = {
    from: "PTEC Digital Library <library@example.com>",
    to: "user@example.com",
    subject: "Test subject",
    html: "<p>Hi</p>",
    text: "Hi",
  };

  it("includes all required MIME headers", () => {
    const raw = buildRawMessage(base);
    expect(raw).toContain("From: PTEC Digital Library <library@example.com>");
    expect(raw).toContain("To: user@example.com");
    expect(raw).toContain("Subject: Test subject");
    expect(raw).toContain("MIME-Version: 1.0");
    expect(raw).toContain("Content-Type: multipart/alternative;");
  });

  it("includes optional Cc/Bcc/Reply-To only when provided", () => {
    const raw = buildRawMessage({ ...base, cc: "cc@example.com", bcc: "bcc@example.com", replyTo: "reply@example.com" });
    expect(raw).toContain("Cc: cc@example.com");
    expect(raw).toContain("Bcc: bcc@example.com");
    expect(raw).toContain("Reply-To: reply@example.com");

    const rawWithout = buildRawMessage(base);
    expect(rawWithout).not.toContain("Cc:");
    expect(rawWithout).not.toContain("Bcc:");
    expect(rawWithout).not.toContain("Reply-To:");
  });

  it("base64-encodes the text and html parts so UTF-8 body content survives", () => {
    const raw = buildRawMessage({ ...base, text: "សួស្តី", html: "<p>សួស្តី</p>" });
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    // The raw literal UTF-8 bytes should not appear unescaped in the message.
    expect(raw).not.toContain("សួស្តី");
  });

  it("sanitizes CR/LF in header-bound fields to prevent header injection", () => {
    const raw = buildRawMessage({ ...base, to: "user@example.com\r\nBcc: attacker@evil.com" });
    // The injected text must not land on its own header line — it should be
    // collapsed into the To: line instead of becoming a real Bcc: header.
    const lines = raw.split("\r\n");
    expect(lines).not.toContain("Bcc: attacker@evil.com");
    expect(lines.find((l) => l.startsWith("To:"))).toBe("To: user@example.com Bcc: attacker@evil.com");
  });
});
