/**
 * Re-point a legacy admin URL at its canonical replacement without losing the
 * state the old URL carried.
 *
 * `redirect("/admin/books")` sends the browser to exactly that path — the query
 * string of the incoming request is NOT carried over. Every legacy book route
 * had meaningful params (`?status=`, `?quality=`, `?title=`, `?confidence=`,
 * `?page=`), so a bare redirect would silently drop a librarian's filter and
 * leave them looking at the wrong set of records.
 */
export function withForwardedQuery(
  path: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const forwarded = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    // Repeated params (?tag=a&tag=b) arrive as an array; keep every value.
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== "") forwarded.append(key, item);
    }
  }
  const qs = forwarded.toString();
  return qs ? `${path}?${qs}` : path;
}
