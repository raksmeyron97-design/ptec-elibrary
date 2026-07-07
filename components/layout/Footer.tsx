/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-unused-vars */
import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import MobileBottomNav from "./MobileBottomNav";
import { createClient } from "@/lib/supabase/server";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { getTranslations } from "next-intl/server";
import { PTEC } from "@/lib/ptec";

/* ────────────────────────────────────────────────────────────
   Footer styles — CSS-only animations, no runtime JS.
   Respects prefers-reduced-motion throughout.
   ──────────────────────────────────────────────────────────── */
const footerStyles = `
  /* Focus */
  .ptec-footer :focus-visible {
    outline: 2px solid #FBBF24;
    outline-offset: 3px;
    border-radius: 8px;
  }

  /* ── Twinkling starfield (3 out-of-phase groups) ── */
  @keyframes ptec-twinkle-a {
    0%,100% { opacity: 0.12; }
    50%      { opacity: 0.85; }
  }
  @keyframes ptec-twinkle-b {
    0%,100% { opacity: 0.65; }
    50%      { opacity: 0.08; }
  }
  @keyframes ptec-twinkle-c {
    0%,33%  { opacity: 0.25; }
    66%     { opacity: 0.90; }
    100%    { opacity: 0.25; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .ptec-stars-a { animation: ptec-twinkle-a 3.0s ease-in-out infinite; }
    .ptec-stars-b { animation: ptec-twinkle-b 4.4s ease-in-out infinite; animation-delay: -1.6s; }
    .ptec-stars-c { animation: ptec-twinkle-c 5.8s ease-in-out infinite; animation-delay: -3.1s; }
  }

  /* ── Aurora orbs ── */
  @keyframes ptec-orb1 {
    0%,100% { transform: translate(0,0) scale(1); }
    33%     { transform: translate(9%,14%) scale(1.13); }
    66%     { transform: translate(-7%,-9%) scale(0.91); }
  }
  @keyframes ptec-orb2 {
    0%,100% { transform: translate(0,0) scale(1); }
    33%     { transform: translate(-11%,-16%) scale(1.09); }
    66%     { transform: translate(13%,11%) scale(0.93); }
  }
  @keyframes ptec-orb3 {
    0%,100% { transform: translate(0,0) scale(1); }
    50%     { transform: translate(7%,-13%) scale(1.11); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .ptec-orb-1 { animation: ptec-orb1 20s ease-in-out infinite; }
    .ptec-orb-2 { animation: ptec-orb2 25s ease-in-out infinite; animation-delay: -9s; }
    .ptec-orb-3 { animation: ptec-orb3 17s ease-in-out infinite; animation-delay: -5s; }
  }

  /* ── Animated gradient top border ── */
  @keyframes ptec-flow {
    0%   { background-position: 0% 50%; }
    50%  { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .ptec-gradient-top {
    height: 2px;
    background: linear-gradient(
      90deg,
      #1E3A8A 0%, #3B82F6 18%, #FBBF24 36%,
      #F59E0B 50%, #FBBF24 64%, #3B82F6 82%, #1E3A8A 100%
    );
    background-size: 300% 100%;
  }
  @media (prefers-reduced-motion: no-preference) {
    .ptec-gradient-top { animation: ptec-flow 6s ease infinite; }
  }

  /* ── Shimmer gold text ── */
  @keyframes ptec-shimmer {
    from { background-position: -200% center; }
    to   { background-position:  200% center; }
  }
  .ptec-shimmer {
    background: linear-gradient(
      90deg,
      #FBBF24 0%, #FEF9C3 30%, #FBBF24 50%, #F59E0B 70%, #FBBF24 100%
    );
    background-size: 200% auto;
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }
  @media (prefers-reduced-motion: no-preference) {
    .ptec-shimmer { animation: ptec-shimmer 3s linear infinite; }
  }

  /* ── Social icons ── */
  .ptec-social {
    transition: transform .28s cubic-bezier(.2,.8,.2,1),
                background-color .25s ease,
                border-color .25s ease,
                box-shadow .28s ease;
  }
  .ptec-social:hover { transform: translateY(-4px) scale(1.08); }
  .ptec-social-fb:hover  { box-shadow: 0 8px 22px -4px rgba(24,119,242,.55); }
  .ptec-social-yt:hover  { box-shadow: 0 8px 22px -4px rgba(255,0,0,.55); }
  .ptec-social-web:hover { box-shadow: 0 8px 22px -4px rgba(251,191,36,.55); }

  /* ── Info cards (glassmorphism on hover) ── */
  .ptec-card {
    transition: background-color .3s ease, border-color .3s ease,
                transform .3s ease, box-shadow .3s ease;
  }
  .ptec-row:hover .ptec-card {
    background-color: rgba(251,191,36,.12);
    border-color: rgba(251,191,36,.48);
    transform: translateY(-1px);
    box-shadow: 0 0 14px rgba(251,191,36,.22);
  }

  /* ── Column glass panels ── */
  .ptec-col {
    border-radius: 16px;
    padding: 20px;
    background: rgba(255,255,255,.025);
    border: 1px solid rgba(255,255,255,.06);
    transition: background-color .35s ease,
                border-color .35s ease,
                box-shadow .35s ease;
  }
  .ptec-col:hover {
    background: rgba(255,255,255,.05);
    border-color: rgba(251,191,36,.2);
    box-shadow: 0 0 32px rgba(251,191,36,.06) inset;
  }

  /* ── Quick links ── */
  .ptec-link {
    transition: color .2s ease, transform .2s ease;
  }
  .ptec-link:hover { transform: translateX(5px); }
  .ptec-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: rgba(251,191,36,.4);
    flex-shrink: 0;
    transition: background-color .2s ease, transform .2s ease, box-shadow .2s ease;
  }
  .ptec-link:hover .ptec-dot {
    background: #FBBF24;
    transform: scale(1.7);
    box-shadow: 0 0 7px rgba(251,191,36,.65);
  }

  /* ── Map ── */
  .ptec-mapwrap {
    transition: border-color .3s ease, box-shadow .3s ease, transform .3s ease;
  }
  .ptec-mapwrap:hover {
    border-color: rgba(251,191,36,.52);
    box-shadow: 0 0 26px -4px rgba(251,191,36,.22),
                0 14px 34px -16px rgba(0,0,0,.7);
    transform: translateY(-2px);
  }

  /* ── Seal ── */
  .ptec-seal {
    display: inline-flex;
    transition: transform .5s cubic-bezier(.2,.8,.2,1), filter .5s ease;
    transform-origin: center bottom;
  }
  .ptec-seal:hover {
    transform: scale(1.08) rotate(-2deg);
    filter: drop-shadow(0 0 14px rgba(251,191,36,.58));
  }

  /* ── Gradient divider ── */
  .ptec-divider {
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(251,191,36,.28) 30%,
      rgba(255,255,255,.08) 50%,
      rgba(251,191,36,.28) 70%,
      transparent
    );
  }

  /* ── Scroll-reveal (progressive enhancement) ── */
  @keyframes ptec-rise {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0);    }
  }
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .ptec-reveal {
        opacity: 0;
        animation-name: ptec-rise;
        animation-fill-mode: both;
        animation-timeline: view();
        animation-range: entry 4% cover 26%;
      }
      .ptec-reveal.r2 { animation-range: entry  8% cover 28%; }
      .ptec-reveal.r3 { animation-range: entry 12% cover 30%; }
      .ptec-reveal.r4 { animation-range: entry 16% cover 32%; }
      .ptec-reveal.rb { animation-range: entry 20% cover 42%; }
    }
  }
`;

export default async function Footer() {
  const t = await getTranslations("footer");
  const supabase = await createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  const user = authUser
    ? await supabase
        .from("profiles")
        .select("full_name, avatar_url, role")
        .eq("id", authUser.id)
        .single()
        .then(({ data }) => {
          const googleAvatar = authUser.user_metadata?.avatar_url || authUser.user_metadata?.picture;
          const googleName = authUser.user_metadata?.full_name || authUser.user_metadata?.name;
          return {
            email: authUser.email ?? "",
            full_name: data?.full_name ?? googleName ?? null,
            avatar_url: data?.avatar_url ?? googleAvatar ?? null,
            role: (data?.role ?? "reader") as "reader" | "admin",
          };
        })
    : null;

  const quickLinks: [string, string][] = [
    ["Home", "/home"],
    ["E-Resources", "/books"],
    ["Posts", "/posts"],
    ["About Us", "/about"],
    ["Contact", "/contact"],
    ["Library Rules", "/rules"],
    ["Privacy", "/privacy"],
  ];

  const headingClass =
    "text-white font-khmer-serif font-bold text-[15px] flex items-center gap-3 " +
    "after:content-[''] after:flex-1 after:h-px " +
    "after:bg-gradient-to-r after:from-amber-400/40 after:to-white/5";

  return (
    <footer className="ptec-footer relative w-full mt-auto font-sans overflow-hidden bg-blue-950 dark:bg-bg-surface">
      <style dangerouslySetInnerHTML={{ __html: footerStyles }} />

      {/* ── Animated gradient top border ── */}
      <div className="ptec-gradient-top" />

      {/* ── Background layer: aurora orbs ── */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="ptec-orb-1 absolute -top-1/3 -left-1/4 w-[55%] h-[55%] rounded-full bg-blue-700/10 blur-[80px]" />
        <div className="ptec-orb-2 absolute -bottom-1/3 -right-1/4 w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[80px]" />
        <div className="ptec-orb-3 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] rounded-full bg-amber-500/5 blur-[60px]" />
      </div>

      {/* ── Background layer: twinkling starfield (3 groups) ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Group A — fades in */}
        <div
          className="ptec-stars-a absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(1px 1px at 10% 15%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 25% 40%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 55% 28%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 80% 35%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 15% 55%, #fff 0%, transparent 100%)
            `,
          }}
        />
        {/* Group B — fades out */}
        <div
          className="ptec-stars-b absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(1.5px 1.5px at 40% 8%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 70% 12%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 92% 45%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 35% 65%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 5% 80%, #fff 0%, transparent 100%)
            `,
          }}
        />
        {/* Group C — phase-shifted */}
        <div
          className="ptec-stars-c absolute inset-0"
          style={{
            backgroundImage: `
              radial-gradient(1.5px 1.5px at 60% 50%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 75% 60%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 90% 20%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 48% 75%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 85% 70%, #fff 0%, transparent 100%)
            `,
          }}
        />
      </div>

      {/* ── Gradient vignette overlay ── */}
      <div className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-blue-950/70 via-blue-950/50 to-blue-950/92" />

      {/* ── Footer Content ── */}
      <div className="relative z-10">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 pt-12 sm:pt-16 pb-10 sm:pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 pb-10">

            {/* ── Brand column ── */}
            <div className="ptec-reveal ptec-col flex flex-col gap-5">
              <div className="flex flex-col items-start gap-3">
                <span className="ptec-seal">
                  <Seal size={72} variant="footer" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200 mb-1">
                    បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
                  </p>
                  <h2 className="font-khmer-serif font-bold text-xl tracking-wide">
                    <span className="text-white">PTEC </span>
                    <span className="ptec-shimmer">Library</span>
                  </h2>
                </div>
              </div>

              <p className="text-blue-100/85 text-[13px] leading-relaxed max-w-xs">
                {t("description")}
              </p>

              {/* Social icons */}
              <div className="flex flex-wrap gap-2.5 mt-1">
                <a
                  href={PTEC.links.facebook}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="ptec-social ptec-social-fb w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] text-blue-100 hover:text-white cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </a>
                <a
                  href={PTEC.links.youtube}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="YouTube"
                  className="ptec-social ptec-social-yt w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#FF0000] hover:border-[#FF0000] text-blue-100 hover:text-white cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                  </svg>
                </a>
                <a
                  href={PTEC.links.website}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Website"
                  className="ptec-social ptec-social-web w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-gold-500 hover:border-gold-500 text-blue-100 hover:text-white cursor-pointer"
                >
                  <Icon name="globe" className="text-[16px]" />
                </a>
                <InstallPWA />
              </div>
            </div>

            {/* ── Information ── */}
            <div className="ptec-reveal r2 ptec-col flex flex-col gap-6">
              <h3 className={headingClass}>{t("information")}</h3>

              <ul className="flex flex-col gap-5">
                <li className="ptec-row flex items-start gap-3">
                  <div className="ptec-card w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-gold-300">
                    <Icon name="map-pin" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t("locationLabel")}</p>
                    <p className="text-blue-50 text-[13px] leading-snug">{t("locationValue")}</p>
                  </div>
                </li>

                <li className="ptec-row flex items-start gap-3">
                  <div className="ptec-card w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-gold-300">
                    <Icon name="phone" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t("phoneLabel")}</p>
                    <a href={PTEC.phoneTel} className="ptec-link text-blue-50 text-[13px] hover:text-gold-300 inline-block cursor-pointer">
                      {PTEC.phone}
                    </a>
                  </div>
                </li>

                <li className="ptec-row flex items-start gap-3">
                  <div className="ptec-card w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-gold-300">
                    <Icon name="clock" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t("hoursLabel")}</p>
                    <p className="text-blue-50 text-[13px] leading-snug">
                      {t("hoursValue")}
                      <br />
                      <span className="text-gold-400 text-[12px]">{t("hoursClosed")}</span>
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* ── Quick Links ── */}
            <div className="ptec-reveal r3 ptec-col flex flex-col gap-6">
              <h3 className={headingClass}>{t("quickLinks")}</h3>

              <ul className="flex flex-col gap-3.5">
                {quickLinks.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="ptec-link group flex items-center gap-2.5 text-[13px] text-blue-100 hover:text-gold-300"
                    >
                      <span className="ptec-dot" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* ── Find PTEC ── */}
            <div className="ptec-reveal r4 ptec-col flex flex-col gap-6 h-full">
              <h3 className={headingClass}>{t("findPtec")}</h3>

              <div className="ptec-mapwrap relative w-full flex-1 min-h-[180px] sm:min-h-[160px] rounded-xl overflow-hidden border border-white/10">
                <iframe
                  src={PTEC.links.mapEmbed}
                  width="100%"
                  height="100%"
                  style={{ border: 0, pointerEvents: "none" }}
                  allowFullScreen={false}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title="PTEC Location Map"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <Link
                  href={PTEC.links.mapPlace}
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 z-10 block"
                  aria-label="Open Map in new tab"
                />
              </div>

              {/* Flag Counter widget removed 2026-07-06: the middleware CSP
                  (img-src) has never allowed flagcounter.com, so it rendered
                  nothing and only produced a blocked request + console error
                  on every page. */}
            </div>

          </div>

          {/* Gradient divider */}
          <div className="ptec-divider" />
        </div>

        {/* Copyright */}
        <div className="ptec-reveal rb relative z-10 text-center px-6 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-5">
          <p className="text-[12px] text-blue-200/60">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>

      <MobileBottomNav user={user} />
    </footer>
  );
}