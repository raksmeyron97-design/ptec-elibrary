import { describe, it, expect } from "vitest";
import { computeDownloadProfileStatus } from "@/lib/profile/download-profile-shared";

const complete = {
  full_name: "Sok San",
  gender: "female",
  phone: "+855 12 345 678",
  institution_name: "PTEC",
  institution_type: "ptec",
  faculty_department: "Mathematics",
  professional_role: "teacher",
  country: "Cambodia",
  download_purpose: "academic_research",
  download_purpose_other: null,
  responsible_use_accepted_at: "2026-07-14T00:00:00Z",
  download_privacy_consent_at: "2026-07-14T00:00:00Z",
  download_profile_updated_at: "2026-07-14T00:00:00Z",
};

describe("computeDownloadProfileStatus", () => {
  it("reports complete when all required fields + consents are present", () => {
    const s = computeDownloadProfileStatus(complete);
    expect(s.complete).toBe(true);
    expect(s.missingFields).toEqual([]);
    expect(s.percent).toBe(100);
  });

  it("null/empty profile is incomplete and lists every required field", () => {
    const s = computeDownloadProfileStatus(null);
    expect(s.complete).toBe(false);
    expect(s.missingFields).toContain("full_name");
    expect(s.missingFields).toContain("institution_type");
    expect(s.missingFields).toContain("responsible_use_accepted_at");
    expect(s.missingFields).toContain("download_privacy_consent_at");
    expect(s.percent).toBe(0);
  });

  it("blank strings count as missing", () => {
    const s = computeDownloadProfileStatus({ ...complete, phone: "   " });
    expect(s.complete).toBe(false);
    expect(s.missingFields).toContain("phone");
  });

  it("purpose 'other' requires the free-text detail", () => {
    const missing = computeDownloadProfileStatus({ ...complete, download_purpose: "other", download_purpose_other: null });
    expect(missing.complete).toBe(false);
    expect(missing.missingFields).toContain("download_purpose_other");

    const filled = computeDownloadProfileStatus({ ...complete, download_purpose: "other", download_purpose_other: "Grant review" });
    expect(filled.complete).toBe(true);
  });

  it("missing consent alone blocks completeness", () => {
    const s = computeDownloadProfileStatus({ ...complete, download_privacy_consent_at: null });
    expect(s.complete).toBe(false);
    expect(s.missingFields).toEqual(["download_privacy_consent_at"]);
  });

  it("percentage is monotonic and honest (not gamified)", () => {
    const partial = computeDownloadProfileStatus({ full_name: "A", gender: "male", phone: "12345678" });
    expect(partial.percent).toBeGreaterThan(0);
    expect(partial.percent).toBeLessThan(100);
  });
});
