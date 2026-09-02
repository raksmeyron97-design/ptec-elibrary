/**
 * Markdown link rendering with an escaped label.
 *
 * Lives here rather than in app/llms.txt/route.ts because a Next route file may
 * export only route handlers and route config — anything else fails the build's
 * type check (`Property 'markdownLink' is incompatible with index signature`).
 * The unit test imports it from this module.
 */
export function markdownLink(title: string, url: string) {
  // Backslash must be escaped FIRST: escaping only `[`/`]` lets a
  // pre-existing backslash in `title` cancel the escape this function adds
  // (e.g. title containing `\]` becomes `\\]`, which a Markdown parser
  // reads as an escaped backslash followed by a real, unescaped `]`).
  const safeTitle = title
    .replace(/\\/g, "\\\\")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
  return `[${safeTitle}](${url})`;
}
