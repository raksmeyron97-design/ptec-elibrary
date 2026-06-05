import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/ui/core/Icon";
import MobileBottomNav from "./MobileBottomNav";
import { createClient } from "@/lib/supabase/server";
import { Seal } from "@/components/ui/core/Seal";
import InstallPWA from "@/components/ui/pwa/InstallPWA";
import { getTranslations } from 'next-intl/server';

export default async function Footer() {
  const t = await getTranslations('footer');
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
  return (
    <footer className="relative w-full mt-auto font-sans overflow-hidden bg-blue-950 dark:bg-bg-surface border-t-2 border-accent">

      {/* ── Starfield dots (pure CSS, no JS) ── */}
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
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 pt-16 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 border-b border-white/10 pb-12">

            {/* Brand column */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-start gap-3">
                <Seal size={72} />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gold-200 mb-0.5">បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ</p>
                  <h2 className="text-white font-khmer-serif font-bold text-xl tracking-wide">PTEC <span className="text-gold-400">Library</span></h2>
                </div>
              </div>
              <p className="text-blue-100 text-[13px] leading-relaxed">
                {t('description')}
              </p>
              {/* Social icons */}
              <div className="flex gap-2.5 mt-1">
                <a href="https://web.facebook.com/ptec.edu" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-bg-surface/5 border border-white/10 flex items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] transition-all text-blue-100 hover:text-white">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                <a href="https://www.youtube.com/@phnompenhteachereducationc3430" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-bg-surface/5 border border-white/10 flex items-center justify-center hover:bg-[#FF0000] hover:border-[#FF0000] transition-all text-blue-100 hover:text-white">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
                </a>
                <a href="https://www.ptec.edu.kh/" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-bg-surface/5 border border-white/10 flex items-center justify-center hover:bg-gold-500 hover:border-gold-500 transition-all text-blue-100 hover:text-white">
                  <Icon name="globe" className="text-[16px]" />
                </a>
                <InstallPWA />
              </div>
            </div>

            {/* Information */}
            <div>
              <h3 className="text-white font-khmer-serif font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-bg-surface/10">
                {t('information')}
              </h3>
              <ul className="flex flex-col gap-5">
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-bg-surface/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5 text-gold-300">
                    <Icon name="map-pin" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t('locationLabel')}</p>
                    <p className="text-blue-50 text-[13px] leading-snug">
                      {t('locationValue')}
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-bg-surface/5 border border-white/10 flex items-center justify-center shrink-0 text-gold-300">
                    <Icon name="phone" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t('phoneLabel')}</p>
                    <p className="text-blue-50 text-[13px]">012 950 192</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-bg-surface/5 border border-white/10 flex items-center justify-center shrink-0 text-gold-300">
                    <Icon name="clock" className="text-[14px]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-blue-200 uppercase tracking-wider mb-0.5">{t('hoursLabel')}</p>
                    <p className="text-blue-50 text-[13px] leading-snug">
                      {t('hoursValue')}<br />
                      <span className="text-gold-400 text-[12px]">{t('hoursClosed')}</span>
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-white font-khmer-serif font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-bg-surface/10">
                {t('quickLinks')}
              </h3>
              <ul className="flex flex-col gap-3">
                {[
                  ["Home",           "/home"],
                  ["E-Resources",    "/books"],
                  ["Posts",          "/posts"],
                  ["About Us",       "/about"],
                  ["Contact",        "/contact"],
                  ["Library Rules",  "/rules"],
                ].map(([label, href]) => (
                  <li key={href}>
                    <Link href={href} className="flex items-center gap-2.5 text-[13px] text-blue-100 hover:text-gold-300 transition-colors group">
                      <span className="w-1 h-1 rounded-full bg-gold-400/50 group-hover:bg-gold-400 transition-colors" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Find PTEC */}
            <div className="flex flex-col h-full gap-4">
              <h3 className="text-white font-khmer-serif font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-bg-surface/10">
                {t('findPtec')}
              </h3>
              <div className="relative w-full flex-1 min-h-[160px] rounded-xl overflow-hidden border border-white/10 group">
                <Link href="https://www.google.com/maps/place/Phnom+Penh+Teacher+Education+College/@11.5574509,104.8872382,1090m/data=!3m1!1e3!4m6!3m5!1s0x310951a618265c67:0x159b1d2bb350bbae!8m2!3d11.5568858!4d104.8872782!16s%2Fg%2F1q665w1lh?entry=ttu&g_ep=EgoyMDI2MDUyNy4wIKXMDSoASAFQAw%3D%3D" target="_blank" rel="noreferrer" className="block w-full h-full relative">
                  <iframe 
                    src="https://maps.google.com/maps?q=Phnom%20Penh%20Teacher%20Education%20College&t=&z=15&ie=UTF8&iwloc=&output=embed" 
                    width="100%" 
                    height="100%" 
                    style={{ border: 0, pointerEvents: 'none' }} 
                    allowFullScreen={false} 
                    loading="lazy" 
                    referrerPolicy="no-referrer-when-downgrade"
                    title="PTEC Location Map"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </Link>
              </div>
              {/* Flag Counter Widget */}
              <div className="flex justify-start">
                <a href="https://info.flagcounter.com/19Xs" target="_blank" rel="noopener noreferrer">
                  <img 
                    src="https://s01.flagcounter.com/count2/19Xs/bg_FFFFFF/txt_000000/border_CCCCCC/columns_2/maxflags_10/viewers_0/labels_0/pageviews_0/flags_0/percent_0/" 
                    alt="Flag Counter" 
                  />
                </a>
              </div>
            </div>

          </div>
        </div>

        {/* Copyright */}
        <div className="relative z-10 text-center py-5 px-6">
          <p className="text-[12px] text-blue-200/70">
            {t('copyright', { year: new Date().getFullYear() })}
          </p>
        </div>

      </div>

      <MobileBottomNav user={user} />
    </footer>
  );
}