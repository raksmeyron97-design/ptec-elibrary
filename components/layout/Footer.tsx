import Image from "next/image";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import MobileBottomNav from "./MobileBottomNav";
import { createClient } from "@/lib/supabase/server";

export default async function Footer() {
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
        .then(({ data }) => ({
          email: authUser.email ?? "",
          full_name: data?.full_name ?? null,
          avatar_url: data?.avatar_url ?? null,
          role: (data?.role ?? "reader") as "reader" | "admin",
        }))
    : null;
  return (
    <footer className="relative w-full mt-auto font-sans overflow-hidden bg-[#0a0d14]">

      {/* ── Starfield dots (pure CSS, no JS) ── */}
      <div className="pointer-events-none absolute inset-0 z-0">
        {/* Static scattered star dots via radial gradients */}
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

      {/* ── City skyline SVG background ── */}
      <div className="pointer-events-none absolute bottom-[52px] left-0 right-0 z-0 opacity-[0.12]">
        <svg
          viewBox="0 0 1440 260"
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMax meet"
          className="w-full"
          fill="none"
          stroke="#a0c4d8"
          strokeWidth="1.2"
        >
          {/* Left cluster — traditional Khmer towers */}
          <g>
            <rect x="20" y="160" width="18" height="100" />
            <polygon points="20,160 29,140 38,160" />
            <rect x="44" y="175" width="14" height="85" />
            <polygon points="44,175 51,158 58,175" />
            <rect x="64" y="150" width="22" height="110" />
            <polygon points="64,150 75,128 86,150" />
            <line x1="64" y1="150" x2="86" y2="150" />
            <line x1="68" y1="165" x2="82" y2="165" />
            <line x1="68" y1="180" x2="82" y2="180" />
            <line x1="68" y1="195" x2="82" y2="195" />
            <rect x="92" y="168" width="16" height="92" />
            <polygon points="92,168 100,150 108,168" />
          </g>

          {/* Left-center — modern towers */}
          <g>
            <rect x="150" y="100" width="28" height="160" />
            <line x1="150" y1="120" x2="178" y2="120" />
            <line x1="150" y1="140" x2="178" y2="140" />
            <line x1="150" y1="160" x2="178" y2="160" />
            <line x1="150" y1="180" x2="178" y2="180" />
            <line x1="150" y1="200" x2="178" y2="200" />
            <line x1="158" y1="100" x2="158" y2="260" />
            <line x1="166" y1="100" x2="166" y2="260" />
            <rect x="188" y="130" width="20" height="130" />
            <line x1="188" y1="150" x2="208" y2="150" />
            <line x1="188" y1="170" x2="208" y2="170" />
            <line x1="188" y1="190" x2="208" y2="190" />
            <rect x="215" y="80" width="36" height="180" />
            <rect x="221" y="60" width="24" height="25" />
            <line x1="215" y1="105" x2="251" y2="105" />
            <line x1="215" y1="130" x2="251" y2="130" />
            <line x1="215" y1="155" x2="251" y2="155" />
            <line x1="215" y1="180" x2="251" y2="180" />
            <line x1="215" y1="205" x2="251" y2="205" />
            <line x1="226" y1="80" x2="226" y2="260" />
            <line x1="236" y1="80" x2="236" y2="260" />
            <line x1="246" y1="80" x2="246" y2="260" />
          </g>

          {/* Center — landmark tall tower */}
          <g>
            <rect x="360" y="40" width="50" height="220" />
            <rect x="370" y="20" width="30" height="25" />
            <line x1="385" y1="10" x2="385" y2="20" />
            <line x1="360" y1="70" x2="410" y2="70" />
            <line x1="360" y1="100" x2="410" y2="100" />
            <line x1="360" y1="130" x2="410" y2="130" />
            <line x1="360" y1="160" x2="410" y2="160" />
            <line x1="360" y1="190" x2="410" y2="190" />
            <line x1="360" y1="220" x2="410" y2="220" />
            <line x1="378" y1="40" x2="378" y2="260" />
            <line x1="392" y1="40" x2="392" y2="260" />
          </g>

          {/* Center-right cluster */}
          <g>
            <rect x="480" y="90" width="32" height="170" />
            <rect x="486" y="70" width="20" height="25" />
            <line x1="480" y1="115" x2="512" y2="115" />
            <line x1="480" y1="140" x2="512" y2="140" />
            <line x1="480" y1="165" x2="512" y2="165" />
            <line x1="480" y1="190" x2="512" y2="190" />
            <line x1="488" y1="90" x2="488" y2="260" />
            <line x1="496" y1="90" x2="496" y2="260" />
            <line x1="504" y1="90" x2="504" y2="260" />
            <rect x="522" y="120" width="24" height="140" />
            <polygon points="522,120 534,100 546,120" />
            <line x1="522" y1="145" x2="546" y2="145" />
            <line x1="522" y1="165" x2="546" y2="165" />
            <line x1="522" y1="185" x2="546" y2="185" />
          </g>

          {/* Dome / curved building */}
          <g>
            <path d="M620,260 L620,170 Q660,130 700,170 L700,260" />
            <line x1="620" y1="200" x2="700" y2="200" />
            <line x1="620" y1="225" x2="700" y2="225" />
            <line x1="635" y1="170" x2="635" y2="260" />
            <line x1="660" y1="152" x2="660" y2="260" />
            <line x1="685" y1="170" x2="685" y2="260" />
            <circle cx="660" cy="148" r="6" />
          </g>

          {/* Right-center towers */}
          <g>
            <rect x="780" y="70" width="44" height="190" />
            <rect x="788" y="50" width="28" height="24" />
            <line x1="780" y1="95" x2="824" y2="95" />
            <line x1="780" y1="120" x2="824" y2="120" />
            <line x1="780" y1="145" x2="824" y2="145" />
            <line x1="780" y1="170" x2="824" y2="170" />
            <line x1="780" y1="195" x2="824" y2="195" />
            <line x1="780" y1="220" x2="824" y2="220" />
            <line x1="795" y1="70" x2="795" y2="260" />
            <line x1="803" y1="70" x2="803" y2="260" />
            <line x1="812" y1="70" x2="812" y2="260" />
            <rect x="838" y="110" width="26" height="150" />
            <line x1="838" y1="135" x2="864" y2="135" />
            <line x1="838" y1="155" x2="864" y2="155" />
            <line x1="838" y1="175" x2="864" y2="175" />
            <line x1="838" y1="195" x2="864" y2="195" />
          </g>

          {/* Palm trees center */}
          <g>
            <line x1="720" y1="260" x2="720" y2="200" />
            <path d="M720,200 Q700,185 690,170" />
            <path d="M720,200 Q730,182 745,172" />
            <path d="M720,205 Q705,195 695,188" />
            <line x1="760" y1="260" x2="760" y2="205" />
            <path d="M760,205 Q742,190 733,175" />
            <path d="M760,205 Q775,188 785,176" />
          </g>

          {/* Right cluster */}
          <g>
            <rect x="950" y="115" width="30" height="145" />
            <line x1="950" y1="140" x2="980" y2="140" />
            <line x1="950" y1="165" x2="980" y2="165" />
            <line x1="950" y1="190" x2="980" y2="190" />
            <line x1="950" y1="215" x2="980" y2="215" />
            <rect x="992" y="80" width="40" height="180" />
            <rect x="1000" y="60" width="24" height="25" />
            <line x1="992" y1="105" x2="1032" y2="105" />
            <line x1="992" y1="130" x2="1032" y2="130" />
            <line x1="992" y1="155" x2="1032" y2="155" />
            <line x1="992" y1="180" x2="1032" y2="180" />
            <line x1="992" y1="205" x2="1032" y2="205" />
            <line x1="1003" y1="80" x2="1003" y2="260" />
            <line x1="1012" y1="80" x2="1012" y2="260" />
            <line x1="1021" y1="80" x2="1021" y2="260" />
            <rect x="1050" y="140" width="22" height="120" />
            <polygon points="1050,140 1061,120 1072,140" />
          </g>

          {/* Far right traditional */}
          <g>
            <rect x="1150" y="155" width="20" height="105" />
            <polygon points="1150,155 1160,135 1170,155" />
            <rect x="1180" y="135" width="26" height="125" />
            <polygon points="1180,135 1193,110 1206,135" />
            <line x1="1180" y1="160" x2="1206" y2="160" />
            <line x1="1180" y1="185" x2="1206" y2="185" />
            <line x1="1180" y1="210" x2="1206" y2="210" />
            <rect x="1218" y="170" width="16" height="90" />
            <polygon points="1218,170 1226,155 1234,170" />
            <rect x="1260" y="145" width="30" height="115" />
            <line x1="1260" y1="170" x2="1290" y2="170" />
            <line x1="1260" y1="195" x2="1290" y2="195" />
            <line x1="1260" y1="220" x2="1290" y2="220" />
            <line x1="1275" y1="145" x2="1275" y2="260" />
            <rect x="1310" y="165" width="18" height="95" />
            <polygon points="1310,165 1319,148 1328,165" />
            <rect x="1380" y="155" width="22" height="105" />
            <polygon points="1380,155 1391,132 1402,155" />
            <line x1="1380" y1="180" x2="1402" y2="180" />
            <line x1="1380" y1="205" x2="1402" y2="205" />
          </g>

          {/* Ground line */}
          <line x1="0" y1="260" x2="1440" y2="260" strokeWidth="1.5" />
        </svg>
      </div>

      {/* ── Gradient overlay ── */}
      <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0a0d14]/80 via-[#0a0d14]/60 to-[#0a0d14]/95 pointer-events-none" />

      {/* ── Footer Content ── */}
      <div className="relative z-10">

        {/* Main grid */}
        <div className="max-w-[1400px] mx-auto px-6 md:px-12 pt-16 pb-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 border-b border-white/10 pb-12">

            {/* Brand column */}
            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-start gap-3">
                <div className="bg-white/8 border border-white/15 rounded-2xl p-3 flex items-center justify-center w-16 h-16">
                  <Image
                    src="/logo_footer.png"
                    alt="PTEC Logo"
                    width={52}
                    height={52}
                    className="object-contain"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#00a8c6]/70 mb-0.5">បណ្ណាល័យវិទ្យាស្ថានគរុកោសល្យរាជធានីភ្នំពេញ</p>
                  <h2 className="text-white font-bold text-xl tracking-wide">PTEC <span className="text-[#00a8c6]">e-Library</span></h2>
                </div>
              </div>
              <p className="text-slate-400 text-[13px] leading-relaxed">
                The Phnom Penh Teacher Education College was established to train teachers with quality education, leading students toward a better future without discrimination.
              </p>
              {/* Social icons */}
              <div className="flex gap-2.5 mt-1">
                <a href="https://web.facebook.com/ptec.edu" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#1877F2] hover:border-[#1877F2] transition-all text-slate-300 hover:text-white">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
                </a>
                <a href="https://www.youtube.com/@phnompenhteachereducationc3430" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#FF0000] hover:border-[#FF0000] transition-all text-slate-300 hover:text-white">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
                </a>
                <a href="https://www.ptec.edu.kh/" target="_blank" rel="noreferrer"
                  className="w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-[#00a8c6] hover:border-[#00a8c6] transition-all text-slate-300 hover:text-white">
                  <Icon name="globe" className="text-[16px]" />
                </a>
              </div>
            </div>

            {/* Information */}
            <div>
              <h3 className="text-white font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-white/10">
                Information
              </h3>
              <ul className="flex flex-col gap-5">
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-[#00a8c6]/10 border border-[#00a8c6]/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon name="map-pin" className="text-[14px] text-[#00a8c6]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Location</p>
                    <p className="text-slate-300 text-[13px] leading-snug">
                      St.271, Sangkat Teu Laork 3,<br />Toul Kork, Phnom Penh.
                    </p>
                  </div>
                </li>
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-[#00a8c6]/10 border border-[#00a8c6]/20 flex items-center justify-center shrink-0">
                    <Icon name="phone" className="text-[14px] text-[#00a8c6]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Phone</p>
                    <p className="text-slate-300 text-[13px]">012 950 192</p>
                  </div>
                </li>
                <li className="flex items-start gap-3 group">
                  <div className="w-8 h-8 rounded-lg bg-[#00a8c6]/10 border border-[#00a8c6]/20 flex items-center justify-center shrink-0">
                    <Icon name="clock" className="text-[14px] text-[#00a8c6]" />
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-0.5">Hours</p>
                    <p className="text-slate-300 text-[13px] leading-snug">
                      Mon–Sat: 7 AM – 5 PM<br />
                      <span className="text-[#ff6b35] text-[12px]">Sunday: Closed</span>
                    </p>
                  </div>
                </li>
              </ul>
            </div>

            {/* Quick Links */}
            <div>
              <h3 className="text-white font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-white/10">
                Quick Links
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
                    <Link href={href} className="flex items-center gap-2.5 text-[13px] text-slate-400 hover:text-[#00a8c6] transition-colors group">
                      <span className="w-1 h-1 rounded-full bg-[#00a8c6]/50 group-hover:bg-[#00a8c6] transition-colors" />
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Newsletter */}
            <div>
              <h3 className="text-white font-bold text-[15px] mb-6 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-white/10">
                Newsletter
              </h3>
              <p className="text-[13px] text-slate-400 mb-5 leading-relaxed">
                Subscribe for updates on new books, research papers, and library resources.
              </p>
              <div className="flex items-stretch rounded-xl overflow-hidden border border-white/10 bg-white/5 focus-within:border-[#00a8c6]/50 transition-all">
                <input
                  type="email"
                  placeholder="Your email address"
                  className="bg-transparent px-4 py-3 text-[13px] w-full outline-none text-white placeholder-slate-500"
                />
                <button className="bg-[#00a8c6] hover:bg-[#0090aa] transition-colors px-4 flex items-center justify-center shrink-0">
                  <Icon name="send" className="text-[16px] text-white" />
                </button>
              </div>

              {/* App install card */}
              <div className="mt-6 rounded-xl border border-white/10 bg-white/5 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-[#00a8c6]/15 border border-[#00a8c6]/25 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-[#00a8c6]" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
                    <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
                    <line x1="12" y1="18" x2="12" y2="18"/>
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-white text-[12px] font-semibold">Install this app</p>
                  <p className="text-slate-500 text-[11px]">for quick access</p>
                </div>
                <button className="ml-auto shrink-0 rounded-lg bg-white text-[#0a0d14] text-[11px] font-bold px-3 py-1.5 hover:bg-[#00a8c6] hover:text-white transition-colors">
                  Install
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Copyright */}
        <div className="relative z-10 text-center py-5 px-6">
          <p className="text-[12px] text-slate-600">
            © {new Date().getFullYear()} <span className="text-slate-400 font-semibold">PTEC e-Library</span>. All Rights Reserved. — Phnom Penh Teacher Education College.
          </p>
        </div>

      </div>

      {/* ── Mobile bottom nav (lg:hidden) ── */}
      <MobileBottomNav user={user} />
    </footer>
  );
}