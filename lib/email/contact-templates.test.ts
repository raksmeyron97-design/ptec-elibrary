import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  adminNotificationEmail,
  userConfirmationEmail,
  adminReplyEmail,
  categoryLabel,
} from "./contact-templates";

describe("escapeHtml", () => {
  it("escapes all HTML metacharacters", () => {
    expect(escapeHtml(`<script>alert('x')</script> & "quotes"`)).toBe(
      "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; &quot;quotes&quot;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Hello, library!")).toBe("Hello, library!");
  });
});

describe("outbound email HTML injection safety", () => {
  const XSS_PAYLOAD = `<img src=x onerror=alert(1)>`;

  it("escapes a malicious name/message in the admin notification email", () => {
    const { html } = adminNotificationEmail({
      name: XSS_PAYLOAD,
      email: "attacker@example.com",
      category: "general",
      subject: "hi",
      message: XSS_PAYLOAD,
      contactMessageId: "abc-123",
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("escapes a malicious subject/message in the user confirmation email", () => {
    const { html } = userConfirmationEmail({
      name: "Dara",
      category: "general",
      subject: XSS_PAYLOAD,
      message: XSS_PAYLOAD,
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("escapes a malicious reply body in the admin reply email", () => {
    const { html } = adminReplyEmail({
      name: "Dara",
      subject: "hi",
      replyBody: XSS_PAYLOAD,
      originalMessage: XSS_PAYLOAD,
    });
    expect(html).not.toContain("<img src=x onerror=alert(1)>");
  });

  it("preserves line breaks as <br /> without introducing raw markup", () => {
    const { html } = userConfirmationEmail({
      name: "Dara",
      category: "general",
      subject: "hi",
      message: "line one\nline two",
    });
    expect(html).toContain("line one<br />line two");
  });
});

describe("categoryLabel", () => {
  it("maps known categories to human-readable labels", () => {
    expect(categoryLabel("book_request")).toBe("Book Request");
    expect(categoryLabel("thesis_research")).toBe("Thesis / Research");
  });

  it("falls back to the raw value for an unknown category", () => {
    expect(categoryLabel("mystery")).toBe("mystery");
  });
});
