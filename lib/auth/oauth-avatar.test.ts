import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  isProviderAvatarUrl,
  preferStored,
  providerAvatarMayReplace,
  providerAvatarUrl,
  providerFullName,
  resolveAvatarUrl,
  resolveFullName,
} from "./oauth-avatar";

const GOOGLE = "https://lh3.googleusercontent.com/a/ACg8ocK_example=s96-c";
const UPLOADED = "https://api.storage-ptec.online/files/avatars/abc/photo.jpg";

describe("a provider photo is only believed on a provider's host", () => {
  it("accepts the shards Google actually serves from", () => {
    for (const host of ["lh3", "lh4", "lh5", "lh6", "avatars"]) {
      expect(isProviderAvatarUrl(`https://${host}.googleusercontent.com/a/x=s96-c`)).toBe(true);
    }
    expect(isProviderAvatarUrl("https://avatars.githubusercontent.com/u/1?v=4")).toBe(true);
  });

  it("refuses everything a signup form could have put there", () => {
    // `signUp()` runs in the browser and GoTrue stores `options.data` verbatim,
    // so these are reachable by any self-registered account.
    for (const url of [
      "https://attacker.example/beacon.png",
      "http://lh3.googleusercontent.com/a/x",          // not https
      "https://googleusercontent.com.attacker.example/x", // suffix, not host
      "https://notgoogleusercontent.com/x",            // must break on the dot
      "https://raw.githubusercontent.com/u/1",         // not the avatar host
      "data:image/svg+xml;base64,AAAA",
      "javascript:alert(1)",
      "not a url",
      "",
      "   ",
    ]) {
      expect(isProviderAvatarUrl(url), url).toBe(false);
    }
    expect(isProviderAvatarUrl(null)).toBe(false);
    expect(isProviderAvatarUrl(undefined)).toBe(false);
  });

  it("does not leak an untrusted URL through metadata either", () => {
    expect(providerAvatarUrl({ avatar_url: "https://attacker.example/x.png" })).toBeNull();
  });
});

describe("avatar_url then picture", () => {
  it("prefers avatar_url", () => {
    expect(
      providerAvatarUrl({ avatar_url: GOOGLE, picture: "https://lh4.googleusercontent.com/b=s1" }),
    ).toBe(GOOGLE);
  });

  it("reads picture when GoTrue recorded only the OIDC claim", () => {
    expect(providerAvatarUrl({ picture: GOOGLE })).toBe(GOOGLE);
  });

  it("judges each key on its own — a junk avatar_url never shadows a real picture", () => {
    expect(providerAvatarUrl({ avatar_url: "https://attacker.example/x", picture: GOOGLE })).toBe(GOOGLE);
  });

  it("survives metadata that is not the shape it claims", () => {
    expect(providerAvatarUrl(null)).toBeNull();
    expect(providerAvatarUrl(undefined)).toBeNull();
    expect(providerAvatarUrl({})).toBeNull();
    expect(providerAvatarUrl({ avatar_url: 42, picture: { href: GOOGLE } })).toBeNull();
    expect(providerAvatarUrl({ avatar_url: "   " })).toBeNull();
  });
});

describe("a stored avatar wins wholesale", () => {
  it("an upload is never replaced by the provider's default", () => {
    expect(resolveAvatarUrl(UPLOADED, { avatar_url: GOOGLE })).toBe(UPLOADED);
  });

  it("the provider answers when the reader has uploaded nothing", () => {
    expect(resolveAvatarUrl(null, { avatar_url: GOOGLE })).toBe(GOOGLE);
    expect(resolveAvatarUrl(undefined, { picture: GOOGLE })).toBe(GOOGLE);
  });

  it("neither source means initials, not an empty string", () => {
    expect(resolveAvatarUrl(null, {})).toBeNull();
    expect(resolveAvatarUrl("", null)).toBeNull();
  });
});

describe("a blank stored value falls THROUGH", () => {
  // `handle_new_user()` writes '' for a name it cannot find, which is why `??`
  // was wrong at every call site that used it: it served the empty string.
  it("treats '' and whitespace as absent", () => {
    expect(preferStored("", "Sok Dara")).toBe("Sok Dara");
    expect(preferStored("   ", "Sok Dara")).toBe("Sok Dara");
    expect(preferStored(null, "Sok Dara")).toBe("Sok Dara");
    expect(resolveFullName("", { full_name: "Sok Dara" })).toBe("Sok Dara");
  });

  it("keeps a real stored value", () => {
    expect(preferStored("Chosen Name", "Google Name")).toBe("Chosen Name");
    expect(resolveFullName("Chosen Name", { full_name: "Google Name" })).toBe("Chosen Name");
  });

  it("trims what it returns and never invents a value", () => {
    expect(preferStored("  Sok Dara  ", null)).toBe("Sok Dara");
    expect(preferStored(null, null)).toBeNull();
    expect(preferStored("", "")).toBeNull();
  });

  it("reads full_name then name", () => {
    expect(providerFullName({ full_name: "A", name: "B" })).toBe("A");
    expect(providerFullName({ name: "B" })).toBe("B");
    expect(providerFullName({ name: 7 })).toBeNull();
    expect(providerFullName(null)).toBeNull();
  });
});

describe("what the callback may overwrite", () => {
  it("fills an empty column and refreshes its own earlier copy", () => {
    // Google's URLs rotate; a stale one renders as a broken image.
    expect(providerAvatarMayReplace(null)).toBe(true);
    expect(providerAvatarMayReplace("")).toBe(true);
    expect(providerAvatarMayReplace("https://lh3.googleusercontent.com/a/old=s96-c")).toBe(true);
  });

  it("never touches an upload", () => {
    expect(providerAvatarMayReplace(UPLOADED)).toBe(false);
    expect(providerAvatarMayReplace("https://covers.example/legacy.png")).toBe(false);
  });
});

describe("the rule has one home", () => {
  const root = join(__dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  // Before this module, `dashboard/page.tsx` and `api/me/route.ts` each carried
  // their own `user_metadata?.avatar_url || user_metadata?.picture`, and
  // `dashboard/settings` carried a third copy that had lost the `picture` half.
  const CONSUMERS = [
    "app/[locale]/(public)/dashboard/page.tsx",
    "app/[locale]/(public)/dashboard/settings/page.tsx",
    "app/api/me/route.ts",
    "app/(admin)/admin/(protected)/profile/page.tsx",
    "lib/auth/admin-identity.ts",
    "lib/admin/users.ts",
    "lib/admin/user-profile.ts",
  ];

  it("no consumer reads the provider photo out of metadata by hand", () => {
    for (const file of CONSUMERS) {
      const src = read(file);
      expect(src, file).not.toMatch(/user_metadata\??\.?\??\[?["']?(avatar_url|picture)/);
      expect(src, file).toMatch(/@\/lib\/auth\/oauth-avatar/);
    }
  });

  it("the CSP admits every host the module admits", () => {
    // A URL this module accepts and `img-src` refuses renders as a broken
    // image, which is worse than the initials it replaced.
    const csp = read("lib/csp.ts");
    expect(csp).toMatch(/img-src[^`]*googleusercontent\.com/);
    expect(csp).toMatch(/img-src[^`]*avatars\.githubusercontent\.com/);
  });

  it("the trigger copies the photo, and still refuses to read role from metadata", () => {
    const sql = read("supabase/migrations/0152_provider_avatar_sync.sql");
    expect(sql).toMatch(/INSERT INTO public\.profiles \(id, email, full_name, avatar_url\)/);
    expect(sql).toMatch(/provider_avatar_url\(NEW\.raw_user_meta_data->>'avatar_url'\)/);
    expect(sql).toMatch(/provider_avatar_url\(NEW\.raw_user_meta_data->>'picture'\)/);
    expect(sql).not.toMatch(/raw_user_meta_data->>'role'/);
    // The host check must exist in SQL too: without it the trigger launders the
    // arbitrary URL the application layer refuses into a trusted column.
    expect(sql).toMatch(/googleusercontent/);
    // PostgREST exposes public functions as RPCs.
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.provider_avatar_url\(text\)/);
    // A migration never overwrites an upload.
    expect(sql).toMatch(/NULLIF\(TRIM\(p\.avatar_url\), ''\) IS NULL/);
  });
});
