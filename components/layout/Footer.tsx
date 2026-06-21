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

/* ────────────────────────────────────────────────────────────
   Footer motion + interaction styles.
   - Scroll-reveal uses CSS scroll-driven animations (no JS).
   - Falls back to fully visible content where unsupported.
   - Fully disabled under prefers-reduced-motion.
   ──────────────────────────────────────────────────────────── */
const footerStyles = `
  .ptec-footer :focus-visible {
    outline: 2px solid #FBBF24;            /* gold-400 */
    outline-offset: 3px;
    border-radius: 8px;
  }

  /* Gentle hover micro-interactions */
  .ptec-social {
    transition: transform .25s cubic-bezier(.2,.8,.2,1),
                background-color .25s ease, border-color .25s ease, color .25s ease;
  }
  .ptec-social:hover { transform: translateY(-3px); }

  .ptec-link {
    transition: color .2s ease, transform .2s ease;
  }
  .ptec-link:hover { transform: translateX(4px); }

  .ptec-card {
    transition: background-color .25s ease, border-color .25s ease, transform .25s ease;
  }
  .ptec-row:hover .ptec-card {
    background-color: rgba(255,255,255,.08);
    border-color: rgba(251,191,36,.35);
    transform: translateY(-1px);
  }

  .ptec-mapwrap {
    transition: border-color .3s ease, box-shadow .3s ease;
  }
  .ptec-mapwrap:hover {
    border-color: rgba(251,191,36,.45);
    box-shadow: 0 14px 34px -16px rgba(0,0,0,.7);
  }

  .ptec-seal {
    display: inline-flex;
    transition: transform .5s cubic-bezier(.2,.8,.2,1);
    transform-origin: center bottom;
  }
  .ptec-seal:hover { transform: scale(1.05) rotate(-2deg); }

  /* Scroll-reveal (progressive enhancement) */
  @media (prefers-reduced-motion: no-preference) {
    @supports (animation-timeline: view()) {
      .ptec-reveal {
        opacity: 0;
        animation-name: ptec-rise;
        animation-fill-mode: both;
        animation-timeline: view();
        animation-range: entry 4% cover 26%;
      }
      .ptec-reveal.r2 { animation-range: entry 8% cover 28%; }
      .ptec-reveal.r3 { animation-range: entry 12% cover 30%; }
      .ptec-reveal.r4 { animation-range: entry 16% cover 32%; }
      .ptec-reveal.rb { animation-range: entry 20% cover 42%; }
    }
  }

  @keyframes ptec-rise {
    from { opacity: 0; transform: translateY(26px); }
    to   { opacity: 1; transform: translateY(0); }
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
  ];

  const headingClass =
    "text-white font-khmer-serif font-bold text-[15px] flex items-center gap-3 " +
    "after:content-[''] after:flex-1 after:h-px after:bg-white/10";

  return (
    <footer className="ptec-footer relative w-full mt-auto font-sans overflow-hidden bg-blue-950 dark:bg-bg-surface border-t-2 border-accent">
      <style dangerouslySetInnerHTML={{ __html: footerStyles }} />

      {/* ── Starfield dots (pure CSS, static) ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage: `
              radial-gradient(1px 1px at 10% 15%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 25% 40%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 40% 8%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 55% 28%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 70% 12%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 80% 35%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 90% 20%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 15% 55%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 35% 65%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 60% 50%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 75% 60%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 92% 45%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 5% 80%, #fff 0%, transparent 100%),
              radial-gradient(1px 1px at 48% 75%, #fff 0%, transparent 100%),
              radial-gradient(1.5px 1.5px at 85% 70%, #fff 0%, transparent 100%)
            `,
          }}
        />
      </div>

      <div className="absolute inset-0 z-0 bg-gradient-to-b from-blue-950/80 via-blue-950/60 to-blue-950/95 pointer-events-none" />

      {/* ── Footer Content ── */}
      <div className="relative z-10">
        <div className="max-w-[1400px] mx-auto px-6 sm:px-8 lg:px-12 pt-12 sm:pt-16 pb-10 sm:pb-12">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12 border-b border-white/10 pb-12">

            {/* Brand column */}
            <div className="ptec-reveal flex flex-col gap-5">
              <div className="flex flex-col items-start gap-3">
                <span className="ptec-seal">
                  <Seal size={72} variant="footer" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200 mb-1">
                    បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ
                  </p>
                  <h2 className="text-white font-khmer-serif font-bold text-xl tracking-wide">
                    PTEC <span className="text-gold-400">Library</span>
                  </h2>
                </div>
              </div>

              <p className="text-blue-100/90 text-[13px] leading-relaxed max-w-xs">
                {t("description")}
              </p>

              {/* Social icons */}
              <div className="flex flex-wrap gap-2.5 mt-1">
                <a
                  href="https://web.facebook.com/ptec.edu"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Facebook"
                  className="ptec-social w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] text-blue-100 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                  </svg>
                </a>
                <a
                  href="https://www.youtube.com/@phnompenhteachereducationc3430"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="YouTube"
                  className="ptec-social w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#FF0000] hover:border-[#FF0000] text-blue-100 hover:text-white"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z" />
                  </svg>
                </a>
                <a
                  href="https://www.ptec.edu.kh/"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Website"
                  className="ptec-social w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-gold-500 hover:border-gold-500 text-blue-100 hover:text-white"
                >
                  <Icon name="globe" className="text-[16px]" />
                </a>
                <InstallPWA />
              </div>
            </div>

            {/* Information */}
            <div className="ptec-reveal r2 flex flex-col gap-6">
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
                    <a href="tel:012950192" className="ptec-link text-blue-50 text-[13px] hover:text-gold-300 inline-block">
                      012 950 192
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

            {/* Quick Links */}
            <div className="ptec-reveal r3 flex flex-col gap-6">
              <h3 className={headingClass}>{t("quickLinks")}</h3>

              <ul className="flex flex-col gap-3.5">
                {quickLinks.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="ptec-link group flex items-center gap-2.5 text-[13px] text-blue-100 hover:text-gold-300"
                    >
                      <span className="w-1 h-1 rounded-full bg-gold-400/50 group-hover:bg-gold-400 transition-colors" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Find PTEC */}
            <div className="ptec-reveal r4 flex flex-col gap-6 h-full">
              <h3 className={headingClass}>{t("findPtec")}</h3>

              <div className="ptec-mapwrap relative w-full flex-1 min-h-[180px] sm:min-h-[160px] rounded-xl overflow-hidden border border-white/10">
                <iframe
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3908.772583842131!2d104.88470327464049!3d11.568153444093952!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x310951a618265c67%3A0x159b1d2bb350bbae!2sPhnom%20Penh%20Teacher%20Education%20College!5e0!3m2!1sen!2skh!4v1717904033000!5m2!1sen!2skh"
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
                  href="https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh"
                  target="_blank"
                  rel="noreferrer"
                  className="absolute inset-0 z-10 block"
                  aria-label="Open Map in new tab"
                />
              </div>

              {/* Flag Counter Widget */}
              <div className="flex justify-start">
                <a href="https://info.flagcounter.com/19Xs" target="_blank" rel="noopener noreferrer" aria-label="Visitor flag counter">
                  <img
                    src="https://s11.flagcounter.com/count2/19Xs/bg_FFFFFF/txt_000000/border_CCCCCC/columns_2/maxflags_10/viewers_0/labels_0/pageviews_0/flags_0/percent_0/"
                    alt="Flag Counter"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    className="rounded-md opacity-90 hover:opacity-100 transition-opacity"
                  />
                </a>
              </div>
            </div>

          </div>
        </div>

        {/* Copyright — extra bottom padding clears the fixed MobileBottomNav + safe area */}
        <div className="ptec-reveal rb relative z-10 text-center px-6 pt-5 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-5">
          <p className="text-[12px] text-blue-200/70">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
        </div>
      </div>

      <MobileBottomNav user={user} />
    </footer>
  );
}