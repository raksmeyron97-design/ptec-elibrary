/**
 * Where a person's photo and name come from, and which of those sources may be
 * believed.
 *
 * Google sign-in is the only way most PTEC readers ever create an account, and
 * a Google account always carries a photo — but `public.profiles.avatar_url`
 * was `NULL` for every one of them, because `handle_new_user()` copies only
 * `id`, `email` and `full_name` out of `raw_user_meta_data`. Six surfaces then
 * drew initials for people whose photo the database was already holding one
 * field away (`/admin/users`, `/admin/users/[id]`, the admin identity read,
 * `/admin/profile`, and the reader's own Settings page).
 *
 * Three rules, and the third is the reason this is a module rather than a `||`
 * chain at each call site:
 *
 *  - **A stored avatar wins wholesale.** A photo a reader uploaded through
 *    Settings is a deliberate choice; an identity provider's photo is a
 *    default. Falling back is not the same as merging, and the provider value
 *    never overwrites an upload.
 *  - **`avatar_url` then `picture`.** Google writes BOTH keys and they can
 *    disagree in size; other providers write one or the other. Reading only
 *    `avatar_url` (what `dashboard/settings` did) misses accounts where GoTrue
 *    recorded the OIDC `picture` claim alone.
 *  - **A provider URL is only believed on a provider's host.** `signUp()` runs
 *    in the browser (`app/(auth)/auth/signup/SignupContent.tsx`) and GoTrue's
 *    public endpoint stores whatever `options.data` carries — so
 *    `raw_user_meta_data.avatar_url` is NOT necessarily something an identity
 *    provider wrote. Unfiltered, any self-registered account could put an
 *    arbitrary URL in front of an administrator's browser on `/admin/users`
 *    and be told each time one of them looked. The admin CSP would refuse the
 *    fetch, but a CSP is the last barrier, not the rule.
 *
 * Pure on purpose — no `server-only`, no Supabase import — so the callback, the
 * admin data layer, the dashboard and `/api/me` all ask one function, and the
 * unit tests exercise the real decision offline.
 */

/**
 * Hosts whose avatar URLs came from an identity provider rather than from a
 * signup form. Kept in step with `img-src` in `lib/csp.ts`: a URL this accepts
 * and the CSP refuses renders as a broken image, which is worse than initials.
 *
 * Suffix-matched for Google because the photo is served from a rotating shard
 * (`lh3`, `lh4`, `lh5`, `avatars`) and the shard is not stable across accounts.
 */
const PROVIDER_AVATAR_HOSTS: readonly string[] = [
  "googleusercontent.com",
  "avatars.githubusercontent.com",
];

/** `user_metadata` as the Supabase client hands it over — never trusted as a shape. */
export type UserMetadata = Record<string, unknown> | null | undefined;

function trimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function hostIsProvider(host: string): boolean {
  const lower = host.toLowerCase();
  return PROVIDER_AVATAR_HOSTS.some((d) => lower === d || lower.endsWith(`.${d}`));
}

/**
 * Whether a string is an avatar URL an identity provider published. `https`
 * only — an `http` photo would be blocked as mixed content anyway, and a
 * `data:`/`javascript:` value is not a photo at all.
 */
export function isProviderAvatarUrl(url: string | null | undefined): boolean {
  const candidate = trimmedString(url);
  if (!candidate) return false;
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === "https:" && hostIsProvider(parsed.hostname);
  } catch {
    return false;
  }
}

/** The provider photo on an auth user's metadata, or null. */
export function providerAvatarUrl(metadata: UserMetadata): string | null {
  if (!metadata) return null;
  for (const key of ["avatar_url", "picture"] as const) {
    const candidate = trimmedString(metadata[key]);
    // Each key is judged on its own: a junk `avatar_url` must not shadow a
    // real `picture`, which is exactly the shape Google writes when a profile
    // photo is changed mid-session.
    if (candidate && isProviderAvatarUrl(candidate)) return candidate;
  }
  return null;
}

/** The display name an identity provider published, or null. */
export function providerFullName(metadata: UserMetadata): string | null {
  if (!metadata) return null;
  return trimmedString(metadata.full_name) ?? trimmedString(metadata.name);
}

/**
 * The stored value if it is one, else the fallback.
 *
 * `stored` is blank rather than null for a great many rows — `handle_new_user()`
 * writes `''` for a name it cannot find — so an empty string must fall THROUGH,
 * not stand as a value. `??` alone gets this wrong, which is why the rule is
 * here and not spelled out at each call site.
 */
export function preferStored(
  stored: string | null | undefined,
  fallback: string | null | undefined,
): string | null {
  return trimmedString(stored) ?? trimmedString(fallback);
}

/** The photo to draw: the reader's own, else the provider's, else initials. */
export function resolveAvatarUrl(
  stored: string | null | undefined,
  metadata: UserMetadata,
): string | null {
  return preferStored(stored, providerAvatarUrl(metadata));
}

/** The name to show: the reader's own, else the provider's, else null. */
export function resolveFullName(
  stored: string | null | undefined,
  metadata: UserMetadata,
): string | null {
  return preferStored(stored, providerFullName(metadata));
}

/**
 * Whether the OAuth callback may write the provider photo into
 * `profiles.avatar_url`.
 *
 * True when nothing is stored, and true when what IS stored is itself a
 * provider photo — Google's URLs rotate, so refreshing our own earlier copy
 * keeps it from decaying into a broken image. False for anything else, because
 * anything else is an upload and belongs to the reader.
 */
export function providerAvatarMayReplace(stored: string | null | undefined): boolean {
  const own = trimmedString(stored);
  return own === null || isProviderAvatarUrl(own);
}
