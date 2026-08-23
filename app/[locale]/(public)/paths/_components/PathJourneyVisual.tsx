import { BookOpen, FlaskConical, PencilRuler, Award } from "lucide-react";
import { getTranslations } from "next-intl/server";

/**
 * The hero's "path journey" figure: four nodes joined by a dotted route that
 * draws itself once, with the nodes drifting gently out of phase.
 *
 * Server-rendered by design — no "use client". The whole animation is CSS
 * (`.paths-route`, `.paths-node` in globals.css), so this ships zero JavaScript
 * onto a page whose only client island is the explorer. It is also why the
 * route is inline SVG rather than an image asset: it inherits the brand token
 * via `currentColor`, themes with the page, and costs no extra request.
 *
 * The figure restates the four stages named in the copy beside it, so it is
 * given a single accessible label and its decorative parts are hidden — a
 * screen reader gets the sentence, not four orphaned icon names.
 */
export default async function PathJourneyVisual() {
  const t = await getTranslations("paths");

  const nodes = [
    { Icon: BookOpen, label: t("journeyRead"), cx: 44, cy: 132, delay: "0s" },
    { Icon: FlaskConical, label: t("journeyResearch"), cx: 148, cy: 62, delay: "0.7s" },
    { Icon: PencilRuler, label: t("journeyPractice"), cx: 252, cy: 132, delay: "1.4s" },
    { Icon: Award, label: t("journeyComplete"), cx: 356, cy: 58, delay: "2.1s" },
  ];

  return (
    <figure
      role="img"
      aria-label={t("journeyAria")}
      className="relative mx-auto w-full max-w-[420px] select-none"
    >
      {/* Parchment plate the route sits on. */}
      <div className="rounded-3xl border border-brand/12 bg-gradient-to-br from-brand/[0.06] via-paper to-bg-surface p-4 sm:p-5">
        {/* The icon overlay is positioned in percentages of the SVG's own box,
            so it must share a containing block with the SVG and nothing else —
            anchoring it to the padded plate above put every icon off its node
            by the padding amount. */}
        <div className="relative">
        <svg
          viewBox="0 0 400 200"
          className="block h-auto w-full"
          aria-hidden="true"
          focusable="false"
        >
          {/* The route. A single quadratic path threaded through all four
              nodes; the dash pattern makes it read as a trail rather than a
              connector, and --route-length feeds the draw-on animation. */}
          <path
            d="M 44 132 Q 96 132 148 62 Q 200 62 252 132 Q 304 132 356 58"
            fill="none"
            stroke="currentColor"
            className="paths-route text-brand/35"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="6 9"
            style={{ ["--route-length" as string]: "620", strokeDashoffset: 0 }}
          />

          {/* Node discs. Rendered in SVG so they sit exactly on the route;
              the icons are overlaid in HTML below for crisp stroke rendering. */}
          {nodes.map((n) => (
            <g key={n.label} className="paths-node" style={{ animationDelay: n.delay }}>
              <circle cx={n.cx} cy={n.cy} r="21" className="fill-bg-surface" />
              <circle
                cx={n.cx}
                cy={n.cy}
                r="21"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-brand/25"
              />
            </g>
          ))}
        </svg>

        {/* Icons + labels, positioned over the SVG in percentage space so they
            track the viewBox at every width. */}
        {nodes.map((n) => (
          <div
            key={n.label}
            className="paths-node pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{
              left: `${(n.cx / 400) * 100}%`,
              top: `${(n.cy / 200) * 100}%`,
              animationDelay: n.delay,
            }}
            aria-hidden="true"
          >
            <n.Icon className="h-[18px] w-[18px] text-brand" strokeWidth={1.9} />
          </div>
        ))}

        </div>

        {/* Stage names, laid out on the same rhythm as the nodes. */}
        <div className="mt-1 flex items-center justify-between px-1 text-center">
          {nodes.map((n) => (
            <span
              key={n.label}
              aria-hidden="true"
              className="w-1/4 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-text-muted"
            >
              {n.label}
            </span>
          ))}
        </div>
      </div>
    </figure>
  );
}
