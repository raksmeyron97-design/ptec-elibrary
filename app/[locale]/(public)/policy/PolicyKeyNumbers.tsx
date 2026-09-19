import { getMessages } from "next-intl/server";
import { Clock, Coins, Layers, Repeat2, type LucideIcon } from "lucide-react";
import { KEY_NUMBERS } from "@/lib/policy/borrow";

/**
 * The four headline figures, as a card grid.
 *
 * A card either has a NUMBER or it has WORDS, and the difference is visible.
 * Two of these four have no number in the regulations to print — renewals
 * differ by the item's language and one of them is unlimited, and the late
 * return fine is "the rate set by the library" with no figure recorded
 * anywhere in the source. A placeholder in either card would be a fabricated
 * figure on a page a reader treats as authoritative, so those cards set their
 * qualifier as the headline instead and read as complete rather than broken.
 *
 * Every figure here comes from lib/about/content.ts through lib/policy/
 * borrow.ts — this component states no rule of its own.
 *
 * Server component.
 */

const ICONS: Record<string, LucideIcon> = {
  clock: Clock,
  stack: Layers,
  repeat: Repeat2,
  coins: Coins,
};

type Card = { label: string; unit?: string; text?: string; detail: string };

export default async function PolicyKeyNumbers({ km }: { km: boolean }) {
  // Read as an object rather than by key: a numeric card has `unit` and no
  // `text`, a wordy card has `text` and no `unit`, and asking next-intl for the
  // one that is absent fires its missing-message handler on every render.
  const messages = await getMessages();
  const copy = (messages as { policy?: { keyNumbers?: Record<string, Card | string> } }).policy
    ?.keyNumbers;
  if (!copy) return null;

  const font = km ? "font-khmer-serif" : "";

  return (
    <div className="mt-6">
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KEY_NUMBERS.map(({ id, icon, value, vars }) => {
          const card = copy[id];
          if (!card || typeof card === "string") return null;
          const Icon = ICONS[icon] ?? Clock;
          // Interpolate the figures the regulations supply. Done here rather
          // than through next-intl's formatter because these strings carry
          // plain placeholders, not plurals or dates.
          const fill = (s: string) =>
            s.replace(/\{(\w+)\}/g, (m, k) => String(vars[k] ?? m));

          return (
            <li
              key={id}
              className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand"
                aria-hidden="true"
              >
                <Icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <p className={`mt-3 text-[13px] font-semibold text-text-muted ${font}`}>
                {card.label}
              </p>
              {value !== null ? (
                <p className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-[32px] font-bold leading-none text-text-heading tabular-nums">
                    {value}
                  </span>
                  <span className={`text-[14px] text-text-body ${font}`}>{card.unit}</span>
                </p>
              ) : (
                <p
                  className={`policy-wrap mt-1 text-[17px] font-bold leading-snug text-text-heading ${font}`}
                >
                  {card.text}
                </p>
              )}
              <p className="policy-copy mt-2 text-[13px] text-text-muted">{fill(card.detail)}</p>
            </li>
          );
        })}
      </ul>
      <p className="policy-copy mt-3 text-[13px] text-text-muted">
        {typeof copy.caption === "string" ? copy.caption : null}
      </p>
    </div>
  );
}
