import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  toggleTeamMemberPublished,
} from "./actions";

const mockRequireAdmin = vi.fn();
const mockLogAdminAction = vi.fn();
const mockRevalidateLocalizedPath = vi.fn();
const mockIsAllowedTeamPhotoUrl = vi.fn();

vi.mock("@/lib/auth/requireAdmin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/app/actions/audit", () => ({
  logAdminAction: (...args: unknown[]) => mockLogAdminAction(...args),
}));

vi.mock("@/lib/cache/revalidate", () => ({
  revalidateLocalizedPath: (...args: unknown[]) => mockRevalidateLocalizedPath(...args),
}));

vi.mock("@/lib/team/photo", () => ({
  isAllowedTeamPhotoUrl: (...args: unknown[]) => mockIsAllowedTeamPhotoUrl(...args),
}));

const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockNeq = vi.fn();
const mockOrder = vi.fn();
const mockLimit = vi.fn();
const mockSingle = vi.fn();
const mockMaybeSingle = vi.fn();

const mockSupabase = {
  from: vi.fn((_table: string) => ({
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    select: mockSelect,
  })),
};

vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => mockSupabase,
}));

describe("team admin actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockRequireAdmin.mockResolvedValue({ userId: "admin-user-id" });
    mockIsAllowedTeamPhotoUrl.mockReturnValue(true);

    mockInsert.mockResolvedValue({ error: null });
    mockUpdate.mockReturnValue({ eq: mockEq });
    mockDelete.mockReturnValue({ eq: mockEq });
    mockEq.mockResolvedValue({ error: null });

    mockLimit.mockResolvedValue({ data: [], error: null });

    // Mock select chain
    mockSelect.mockReturnValue({
      eq: mockEq,
      order: mockOrder,
    });
    mockEq.mockReturnValue({
      maybeSingle: mockMaybeSingle,
      neq: mockNeq,
      single: mockSingle,
      limit: mockLimit,
    });
    mockNeq.mockReturnValue({
      data: [],
      error: null,
      limit: mockLimit,
    });
    mockMaybeSingle.mockResolvedValue({ data: { id: "sec-1" }, error: null });
  });

  describe("createTeamMember", () => {
    it("fails when user is not admin", async () => {
      mockRequireAdmin.mockRejectedValue(new Error("Unauthorized"));

      const fd = new FormData();
      fd.set("name_km", "រុន រស្មី");
      fd.set("name_en", "Ron Raksmey");

      const result = await createTeamMember(fd);
      expect(result).toEqual({ error: "Unauthorized" });
    });

    it("fails if name_km or name_en is missing", async () => {
      const fd = new FormData();
      fd.set("name_km", "");
      fd.set("name_en", "Ron Raksmey");

      const res1 = await createTeamMember(fd);
      expect(res1).toEqual({ error: "Khmer name is required." });

      fd.set("name_km", "រុន រស្មី");
      fd.set("name_en", "");

      const res2 = await createTeamMember(fd);
      expect(res2).toEqual({ error: "Latin name is required." });
    });

    it("fails if invalid photo_url is provided", async () => {
      mockIsAllowedTeamPhotoUrl.mockReturnValue(false);

      const fd = new FormData();
      fd.set("name_km", "រុន រស្មី");
      fd.set("name_en", "Ron Raksmey");
      fd.set("photo_url", "https://malicious-site.com/avatar.jpg");

      const res = await createTeamMember(fd);
      expect(res).toEqual({ error: "Photo URL must come from library storage." });
    });

    it("successfully creates a team member with valid payload", async () => {
      const fd = new FormData();
      fd.set("name_km", "រុន រស្មី");
      fd.set("name_en", "Ron Raksmey");
      fd.set("position_km", "អ្នកអភិវឌ្ឍន៍ Full-Stack");
      fd.set("position_en", "Full-Stack Developer");
      fd.set("education", "Bachelor of Computer Science");
      fd.set("years_experience", "3");
      fd.set("bio_km", "ជីវប្រវត្តិសង្ខេប");
      fd.set("bio_en", "Short biography");
      fd.set("is_published", "true");
      fd.set("is_featured", "true");

      const res = await createTeamMember(fd);
      expect(res).toEqual({ success: true });
      expect(mockInsert).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        "admin-user-id",
        "team_member.create",
        "team_members",
        undefined,
        { name_en: "Ron Raksmey" }
      );
      expect(mockRevalidateLocalizedPath).toHaveBeenCalledWith("/admin/team");
    });
  });

  describe("updateTeamMember", () => {
    it("successfully updates an existing team member", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: { slug: "ron-raksmey" }, error: null });

      const fd = new FormData();
      fd.set("name_km", "រុន រស្មី");
      fd.set("name_en", "Ron Raksmey");
      fd.set("position_km", "អ្នកអភិវឌ្ឍន៍ Full-Stack");
      fd.set("position_en", "Full-Stack Developer & Product Designer");

      const res = await updateTeamMember("member-123", fd);
      expect(res).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        "admin-user-id",
        "team_member.update",
        "team_members",
        "member-123",
        { name_en: "Ron Raksmey" }
      );
    });
  });

  describe("deleteTeamMember", () => {
    it("deletes a team member and logs the action", async () => {
      const res = await deleteTeamMember("member-123");
      expect(res).toEqual({ success: true });
      expect(mockDelete).toHaveBeenCalled();
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        "admin-user-id",
        "team_member.delete",
        "team_members",
        "member-123"
      );
    });
  });

  describe("toggleTeamMemberPublished", () => {
    it("toggles published state", async () => {
      mockMaybeSingle.mockResolvedValueOnce({ data: { slug: "ron-raksmey" }, error: null });

      const res = await toggleTeamMemberPublished("member-123", true);
      expect(res).toEqual({ success: true });
      expect(mockUpdate).toHaveBeenCalledWith({ is_published: true });
      expect(mockLogAdminAction).toHaveBeenCalledWith(
        "admin-user-id",
        "team_member.publish",
        "team_members",
        "member-123"
      );
    });
  });
});
