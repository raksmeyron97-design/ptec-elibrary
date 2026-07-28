// Pass-through layout whose only job is to give the (home) group a real
// segment boundary.
//
// Without it, Next collapses a pathless group that has no layout, and the
// homepage's carefully-matched hero skeleton in (home)/loading.tsx never
// rendered: the streamed prerender emitted the parent (public)/loading.tsx
// instead. That was verified in the shipped HTML — the prerendered / document
// contained GenericPageSkeleton's markup (a six-card grid), so the first thing
// a cold visitor painted was a card layout that looks nothing like the
// homepage, which then swapped to the hero.
//
// With this file the boundary materialises and (home)/loading.tsx becomes the
// fallback for the homepage, as it was always meant to be. Keep it a plain
// pass-through: anything async here would suspend ABOVE the boundary and put
// the generic skeleton back.
export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
