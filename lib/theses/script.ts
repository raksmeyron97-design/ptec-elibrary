// The script a piece of text is written in — never the page's UI locale.
// Pure and tiny on purpose: client components tag Khmer runs with it, and
// importing it must not pull the rest of the record builder into a bundle.

const KHMER = /[ក-៿]/g;
const LATIN = /[A-Za-z]/g;

/** "km" when Khmer letters are at least half of the text's letters. */
export function scriptOf(text: string): "en" | "km" {
  const km = text.match(KHMER)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  return km > 0 && km >= latin ? "km" : "en";
}
