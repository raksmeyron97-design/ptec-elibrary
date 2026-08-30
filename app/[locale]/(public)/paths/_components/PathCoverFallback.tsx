import { GraduationCap } from "lucide-react";

/**
 * Stand-in for a path with no cover — or one whose cover_url points at a file
 * that has since been deleted from storage (at least one does today).
 *
 * A tint plus a faint cross-hatch built from two repeating gradients. A plain
 * block with a centred mortarboard made every uncovered path look like the
 * same path in a grid; the hatch gives the panel a texture that reads as
 * deliberate rather than as a failed image.
 *
 * Shared by the grid card and the featured lead so an uncovered collection
 * looks like one design and not two — the lead card used to fall back to a
 * flat `bg-brand/8` panel, which met the card grid's hatch at a hard seam.
 */
export default function PathCoverFallback({ size = "card" }: { size?: "card" | "lead" }) {
  return (
    <div
      className="absolute inset-0 bg-paper"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, transparent 0 11px, color-mix(in srgb, var(--color-brand) 5%, transparent) 11px 22px)," +
          "repeating-linear-gradient(-45deg, transparent 0 11px, color-mix(in srgb, var(--color-brand) 3%, transparent) 11px 22px)",
      }}
    >
      <GraduationCap
        className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-brand/20 ${
          size === "lead" ? "h-16 w-16" : "h-11 w-11"
        }`}
        aria-hidden="true"
      />
    </div>
  );
}
