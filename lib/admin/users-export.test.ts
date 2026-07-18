import { describe, expect, it } from "vitest";
import { usersExportSheet } from "./users-export";
import { sheetsToCsv } from "@/lib/export/csv";
import type { UserRow } from "./users-shared";

const user = (over: Partial<UserRow>): UserRow => ({
  id: "b7e9c9c2-1111-4222-8333-abcdefabcdef",
  fullName: "សុខ ស៊ីម",
  email: "sok@example.com",
  phone: "+855 12 345 678",
  avatarUrl: "https://cdn.example.com/a.png",
  role: "reader",
  isSuperAdmin: false,
  status: "active",
  createdAt: "2026-07-01T02:30:00Z",
  lastLoginAt: "2026-07-17T10:00:00Z",
  emailConfirmed: true,
  ...over,
});

describe("usersExportSheet", () => {
  it("exposes exactly the authorized columns, in a stable order", () => {
    const sheet = usersExportSheet([]);
    expect(sheet.columns.map((c) => c.header)).toEqual([
      "User ID",
      "Full Name",
      "Email",
      "Phone",
      "Role",
      "Account Status",
      "Email Verified",
      "Joined Date",
      "Last Login",
    ]);
  });

  it("maps roles/statuses to readable labels and dates to ISO days", () => {
    const sheet = usersExportSheet([user({ role: "super_admin", status: "blocked" })]);
    const row = sheet.rows[0];
    const get = (key: string) => sheet.columns.find((c) => c.key === key)!.value(row);
    expect(get("role")).toBe("Super Admin");
    expect(get("status")).toBe("Blocked");
    expect(get("createdAt")).toBe("2026-07-01");
    expect(get("lastLoginAt")).toBe("2026-07-17");
    expect(get("emailConfirmed")).toBe("yes");
  });

  it("never exports the avatar URL or any non-UI field", () => {
    const sheet = usersExportSheet([user({})]);
    const values = sheet.columns.map((c) => String(c.value(sheet.rows[0]) ?? ""));
    expect(values.join("|")).not.toContain("cdn.example.com");
  });

  it("serialises to CSV with intact Khmer names and Excel-safe phone numbers", () => {
    const csv = sheetsToCsv([usersExportSheet([user({})])]);
    expect(csv).toContain("សុខ ស៊ីម");
    expect(csv).toContain('"=""+855 12 345 678"""');
    expect(csv.startsWith("\uFEFF")).toBe(true);
  });

  it("handles null phone/name/last-login as empty cells", () => {
    const csv = sheetsToCsv([
      usersExportSheet([user({ fullName: null, phone: null, lastLoginAt: null })]),
    ]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).not.toContain("null");
    expect(dataLine).not.toContain("undefined");
  });
});
