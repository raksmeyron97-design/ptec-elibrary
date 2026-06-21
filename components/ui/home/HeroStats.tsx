import { getTranslations, getLocale } from "next-intl/server";
import AnimatedStat from "./AnimatedStat";

/**
 * HeroStats — "Ledger Rail"
 * A framed stats band that lives INSIDE the dark hero (last child of the hero
 * left column, so it inherits the .hero-stagger entrance). Numbers count up via
 * AnimatedStat; gold underlines draw in on load; cells lift + glow on hover.
 *
 * Expected `stats` shape matches getHomeStats(): { books, views, downloads, users }.
 * If your getHomeStats returns different field names, edit the four `value:` lines.
 */
type HomeStats = { books: number; views: number; downloads: number; users: number };

export default async function HeroStats({ stats }: { stats: HomeStats }) {
  const [t, locale] = await Promise.all([getTranslations("home"), getLocale()]);
  const cap =
    locale === "en"
      ? "uppercase tracking-[0.14em]"
      : "tracking-normal";

  const items = [
    { label: t("statResources"), value: stats.books },
    { label: t("statViews"), value: stats.views },
    { label: t("statDownloads"), value: stats.downloads },
    { label: t("statMembers"), value: stats.users },
  ];

  return (
    <div className="hs-rail mt-10 max-w-xl">
      <style>{`
        .hs-rail{position:relative;}
        .hs-rail::before,.hs-rail::after{content:"";position:absolute;left:0;right:0;height:1px;}
        .hs-rail::before{top:0;background:linear-gradient(90deg,transparent,rgba(221,176,34,.7) 18%,rgba(221,176,34,.7) 82%,transparent);}
        .hs-rail::after{bottom:0;background:linear-gradient(90deg,transparent,rgba(255,255,255,.12),transparent);}
        .hs-grid{display:grid;grid-template-columns:repeat(4,1fr);}
        .hs-cell{position:relative;padding:1.2rem .7rem 1.1rem;transition:transform .25s cubic-bezier(.22,.61,.36,1);}
        .hs-cell + .hs-cell::before{content:"";position:absolute;left:0;top:18%;bottom:18%;width:1px;background:rgba(255,255,255,.1);}
        .hs-cell + .hs-cell::after{content:"";position:absolute;left:-2px;top:calc(18% - 2px);width:5px;height:5px;border-radius:50%;background:#DDB022;opacity:.65;box-shadow:0 0 8px rgba(221,176,34,.5);}
        .hs-num{font-variant-numeric:tabular-nums;line-height:1;color:#fff;display:inline-flex;align-items:baseline;transition:color .25s ease,text-shadow .25s ease;}
        .hs-plus{color:#DDB022;margin-left:1px;}
        .hs-underline{height:2px;width:26px;margin-top:.5rem;border-radius:2px;background:linear-gradient(90deg,#DDB022,#E9C75A);box-shadow:0 0 10px rgba(221,176,34,.35);transition:width .35s cubic-bezier(.22,.61,.36,1),box-shadow .25s ease;}
        .hs-cap{margin-top:.55rem;color:rgba(201,214,245,.62);transition:color .25s ease;}
        .hs-cell:hover{transform:translateY(-3px);}
        .hs-cell:hover .hs-num{text-shadow:0 0 18px rgba(221,176,34,.45);}
        .hs-cell:hover .hs-underline{width:60px;box-shadow:0 0 16px rgba(221,176,34,.6);}
        .hs-cell:hover .hs-cap{color:rgba(233,199,90,.95);}
        @media (prefers-reduced-motion:no-preference){
          .hs-underline{width:0;animation:hsDraw .8s cubic-bezier(.22,.61,.36,1) forwards;}
          .hs-cell:nth-child(1) .hs-underline{animation-delay:.15s;}
          .hs-cell:nth-child(2) .hs-underline{animation-delay:.30s;}
          .hs-cell:nth-child(3) .hs-underline{animation-delay:.45s;}
          .hs-cell:nth-child(4) .hs-underline{animation-delay:.60s;}
          .hs-cell:hover .hs-underline{animation:none;}
        }
        @keyframes hsDraw{to{width:26px;}}
        @media (max-width:640px){
          .hs-grid{grid-template-columns:1fr 1fr;}
          .hs-cell:nth-child(3),.hs-cell:nth-child(4){border-top:1px solid rgba(255,255,255,.08);}
          .hs-cell:nth-child(3)::before,.hs-cell:nth-child(3)::after{display:none;}
        }
      `}</style>

      <div className="hs-grid">
        {items.map((s) => (
          <div key={s.label} className="hs-cell">
            <div
              className="hs-num font-khmer-serif font-semibold"
              style={{ fontSize: "clamp(24px, 2.8vw, 36px)" }}
            >
              <AnimatedStat targetValue={s.value} />
              <span className="hs-plus">+</span>
            </div>
            <div className="hs-underline" aria-hidden />
            <div className={`hs-cap text-[10px] font-bold ${cap}`}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}