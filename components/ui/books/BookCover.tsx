type Variant = "card" | "thumb" | "detail" | "hero";

type BookCoverProps = {
  title: string;
  label?: string | null;
  author?: string | null;
  variant?: Variant;
  className?: string;
};

const BG_COLORS = [
  "#0B1530", // deep navy
  "#172554", // navy blue
  "#1C1917", // charcoal
  "#14532D", // forest green
  "#3B1F5E", // deep purple
  "#7C2D12", // burnt sienna
];

function hashOf(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

function wrapText(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current) lines.push(current.trim());
  return lines.slice(0, 3);
}

export default function BookCover({
  title,
  label,
  author,
  variant = "card",
  className = "",
}: BookCoverProps) {
  const h = hashOf(title || "Untitled");
  const bg = BG_COLORS[h % BG_COLORS.length];

  // Font sizes per variant (viewBox is always 300×400)
  const cfg = {
    hero:   { labelSize: 8,  titleSize: 20, authorSize: 11, maxChars: 16 },
    card:   { labelSize: 9,  titleSize: 22, authorSize: 12, maxChars: 14 },
    thumb:  { labelSize: 7,  titleSize: 16, authorSize: 10, maxChars: 14 },
    detail: { labelSize: 9,  titleSize: 24, authorSize: 13, maxChars: 14 },
  }[variant];

  const titleLines = wrapText(title, cfg.maxChars);
  const titleStartY = 180 - (titleLines.length - 1) * (cfg.titleSize * 1.25);
  const dividerY = titleStartY + titleLines.length * cfg.titleSize * 1.3 + 6;
  const authorY = dividerY + 18;

  // Decorative circle center: top-right quadrant, different per hash
  const cx = 220 + (h % 50);
  const cy = 60 + (h % 40);

  return (
    <div className={`relative w-full h-full ${className}`}>
      <svg
        viewBox="0 0 300 400"
        xmlns="http://www.w3.org/2000/svg"
        className="block w-full h-full"
        aria-label={`Cover of ${title}`}
      >
        {/* Background */}
        <rect width="300" height="400" fill={bg}></rect>

        {/* Decorative concentric circles */}
        <circle cx={cx} cy={cy} r="160" fill="none" stroke="#DDB022" strokeWidth="0.7" opacity="0.2"></circle>
        <circle cx={cx} cy={cy} r="110" fill="none" stroke="#DDB022" strokeWidth="0.7" opacity="0.2"></circle>
        <circle cx={cx} cy={cy} r="65"  fill="none" stroke="#DDB022" strokeWidth="0.7" opacity="0.2"></circle>

        {/* Gold left accent bar */}
        <rect x="0" y="0" width="7" height="400" fill="#DDB022"></rect>

        {/* Label (department / category) */}
        {label && (
          <text
            x="22"
            y="22"
            fontFamily="Georgia, serif"
            fontSize={cfg.labelSize}
            fill="#DDB022"
            opacity="0.8"
            letterSpacing="2.5"
          >
            {label.toUpperCase()}
          </text>
        )}

        {/* Top rule */}
        <rect x="22" y="30" width="258" height="1.5" fill="#DDB022" opacity="0.4"></rect>

        {/* Title lines */}
        {titleLines.map((line, i) => (
          <text
            key={i}
            x="22"
            y={titleStartY + i * cfg.titleSize * 1.3}
            fontFamily="Georgia, serif"
            fontSize={cfg.titleSize}
            fontWeight="bold"
            fill="white"
          >
            {line}
          </text>
        ))}

        {/* Gold divider */}
        <rect x="22" y={dividerY} width="52" height="2" fill="#DDB022"></rect>

        {/* Author */}
        {author && (
          <text
            x="22"
            y={authorY}
            fontFamily="Georgia, serif"
            fontSize={cfg.authorSize}
            fill="rgba(255,255,255,0.65)"
          >
            {author.length > 24 ? author.substring(0, 22) + "…" : author}
          </text>
        )}

        {/* Gold bottom accent bar */}
        <rect x="0" y="390" width="300" height="10" fill="#DDB022" opacity="0.75"></rect>
      </svg>
    </div>
  );
}
