import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateOwnTeamMember } from "./team-profile";

const mockRequireStaff = vi.fn();
const mockRevalidateLocalizedPath = vi.fn();
const mockIsAllowedTeamPhotoUrl = vi.fn();

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireStaff: () => mockRequireStaff(),
}));

vi.mock("@/lib/cache/revalidate", () => ({
  revalidateLocalizedPath: (...args: unknown[]) => mockRevalidateLocalizedPath(...args),
}));

vi.mock("@/lib/team/photo", () => ({
  isAllowedTeamPhotoUrl: (...args: unknown[]) => mockIsAllowedTeamPhotoUrl(...args),
}));

const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockSupabase = {
  from: vi.fn((_table: string) => ({
    update: mockUpdate,
    select: mockSelect,
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockSupabase,
}));

describe("team-profile actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireStaff.mockResolvedValue({ userId: "staff-user-123" });
    mockIsAllowedTeamPhotoUrl.mockReturnValue(true);

    mockUpdate.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });

    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue({
      single: mockSingle,
      maybeSingle: mockMaybeSingle,
    });
    mockSingle.mockResolvedValue({ data: { id: "member-1", slug: "ron-raksmey" }, error: null });
    mockMaybeSingle.mockResolvedValue({ data: { id: "sec-1" }, error: null });
  });

  it("updates own profile successfully", async () => {
    const fd = new FormData();
    fd.set("name_km", "រុន រស្មី");
    fd.set("name_en", "Ron Raksmey");
    fd.set("position_km", "អ្នកអភិវឌ្ឍន៍ Full-Stack");
    fd.set("position_en", "Full-Stack Developer");
    fd.set("education", "បរិញ្ញាបត្រអប់រំ និងគណិតវិទ្យា");
    fd.set("years_experience", "3 ឆ្នាំ");
    fd.set("bio_km", "ជីវប្រវត្តិសង្ខេប");
    fd.set("bio_en", "Brief bio");
    fd.set("photo_url", "https://storage-ptec.online/team/avatar.jpg");

    const res = await updateOwnTeamMember(fd);
    expect(res).toEqual({ success: true });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      name_km: "រុន រស្មី",
      name_en: "Ron Raksmey",
      position_km: "អ្នកអភិវឌ្ឍន៍ Full-Stack",
      position_en: "Full-Stack Developer",
      education: "បរិញ្ញាបត្រអប់រំ និងគណិតវិទ្យា",
      years_experience: "3 ឆ្នាំ",
      bio_km: "ជីវប្រវត្តិសង្ខេប",
      bio_en: "Brief bio",
      photo_url: "https://storage-ptec.online/team/avatar.jpg",
    }));
    expect(mockRevalidateLocalizedPath).toHaveBeenCalledWith("/about/team/ron-raksmey");
    expect(mockRevalidateLocalizedPath).toHaveBeenCalledWith("/about/team");
    expect(mockRevalidateLocalizedPath).toHaveBeenCalledWith("/admin/profile");
  });

  it("returns error if member profile not found for user", async () => {
    mockSingle.mockResolvedValueOnce({ data: null, error: new Error("Not found") });

    const fd = new FormData();
    fd.set("name_km", "រុន រស្មី");
    fd.set("name_en", "Ron Raksmey");

    const res = await updateOwnTeamMember(fd);
    expect(res).toEqual({ error: "No Library Team profile is linked to your account. Ask an admin to link your account." });
  });

  it("validates required fields", async () => {
    const fd = new FormData();
    fd.set("name_km", "");
    fd.set("name_en", "Ron Raksmey");

    const res1 = await updateOwnTeamMember(fd);
    expect(res1).toEqual({ error: "Khmer name is required." });

    fd.set("name_km", "រុន រស្មី");
    fd.set("name_en", "");

    const res2 = await updateOwnTeamMember(fd);
    expect(res2).toEqual({ error: "Latin name is required." });
  });

  it("validates photo URL", async () => {
    mockIsAllowedTeamPhotoUrl.mockReturnValue(false);

    const fd = new FormData();
    fd.set("name_km", "រុន រស្មី");
    fd.set("name_en", "Ron Raksmey");
    fd.set("photo_url", "https://unauthorized-domain.com/photo.jpg");

    const res = await updateOwnTeamMember(fd);
    expect(res).toEqual({ error: "Invalid photo URL." });
  });
});
