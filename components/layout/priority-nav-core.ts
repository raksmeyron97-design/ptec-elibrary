/**
 * Priority+ navigation: how many leading items fit in `available` width.
 *
 * Items collapse from the END of the list (lowest priority last). When not
 * everything fits, the "More" trigger's width must also be reserved.
 * Widths are fractional CSS pixels from getBoundingClientRect; a small
 * epsilon absorbs sub-pixel rounding so items don't flicker at boundaries.
 */
export function computeVisibleCount(
  itemWidths: number[],
  moreWidth: number,
  available: number,
): number {
  const EPS = 0.5;
  const total = itemWidths.reduce((sum, w) => sum + w, 0);
  if (total <= available + EPS) return itemWidths.length;

  let used = moreWidth;
  let count = 0;
  for (const width of itemWidths) {
    if (used + width > available + EPS) break;
    used += width;
    count += 1;
  }
  return count;
}
