import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavbarClient from "./NavbarClient";
import MobileMenu from "./MobileMenu";
import NavLinkActive from "./NavLinkActive";
import NavDropdown from "./NavDropdown";
import NavSearch from "@/components/layout/NavSearch";
import { Seal } from "@/components/ui/Seal";
import Icon from "@/components/ui/Icon";



// ── SVG Icons (outline style) ─────────────────────────────────────────────────
const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const EResourcesIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
    <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

const BooksIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Roof / pediment */}
    <polyline points="3 10 12 3 21 10" />
    {/* Columns */}
    <line x1="6"  y1="10" x2="6"  y2="19" />
    <line x1="10" y1="10" x2="10" y2="19" />
    <line x1="14" y1="10" x2="14" y2="19" />
    <line x1="18" y1="10" x2="18" y2="19" />
    {/* Base */}
    <line x1="2" y1="19" x2="22" y2="19" />
    <line x1="1" y1="22" x2="23" y2="22" />
  </svg>
);

const PostsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const AboutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="8"/>
    <line x1="12" y1="12" x2="12" y2="16"/>
  </svg>
);


// ── Nav config ────────────────────────────────────────────────────────────────
const navLinks = [
  { label: "Home",            href: "/home",     icon: <HomeIcon /> },
  { label: "E-Resources",     href: "/books",    icon: <EResourcesIcon /> },
  { label: "Books In Library",href: "/catalogs", icon: <BooksIcon /> },
  { label: "Posts",           href: "/posts", icon: <PostsIcon /> },
];

const aboutDropdown = {
  label: "About",
  href: "/about",
  icon: <AboutIcon />,
  subLinks: [
    { label: "About",       href: "/about" },
    { label: "Contact",     href: "/contact" },
    { label: "Our Journey", href: "/about/journey" },
  ],
};

// For MobileMenu — flat list including about sub-links
const mobileNavLinks = [
  { label: "Home",            href: "/home" },
  { label: "E-Resources",     href: "/books" },
  { label: "Books In Library",href: "/catalogs" },
  { label: "Posts",           href: "/posts" },
  { label: "About",           href: "/about" },
  { label: "Contact",         href: "/contact" },
  { label: "Our Journey",     href: "/about/journey" },
];

export default async function Navbar() {
  // ── Fetch user + profile server-side ─────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userInfo = null;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, avatar_url, role")
      .eq("id", user.id)
      .single();

    const googleAvatar = user.user_metadata?.avatar_url || user.user_metadata?.picture;
    const googleName = user.user_metadata?.full_name || user.user_metadata?.name;

    userInfo = {
      email:      user.email ?? "",
      full_name:  profile?.full_name  ?? googleName ?? null,
      avatar_url: profile?.avatar_url ?? googleAvatar ?? null,
      role:       (profile?.role ?? "reader") as "reader" | "admin",
    };
  }

  return (
    <header className="fixed top-0 w-full z-50 font-sans shadow-sm">
      {/* Background blur layer */}
      <div className="absolute inset-0 -z-10 bg-bg-surface/95 backdrop-blur-md" />

      {/* Top utility strip */}
      <div className="hidden lg:block bg-blue-950 text-gold-200 text-[12px] relative z-10 font-sans border-b border-white/5">
        <div className="flex items-center justify-between px-6 md:px-12 py-2 max-w-[1400px] mx-auto w-full">
          {/* Left: Contact Info */}
          <div className="flex items-center gap-8 xl:gap-12">
            <div className="flex items-center gap-2">
              <Icon name="phone" className="text-[14px] text-accent" />
              <span className="tracking-wide">(+855)- 889072070</span>
            </div>
            <span className="opacity-30">|</span>
            <div className="flex items-center gap-2">
              <Icon name="mail" className="text-[14px] text-accent" />
              <span>info@ptec.edu.kh <span className="opacity-50 mx-1">|</span> raksmyeron97@gmail.com</span>
            </div>
            <span className="opacity-30">|</span>
            <a href="https://maps.app.goo.gl/ZUFqo4sBHDTRW1V1A" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-gold-400 transition-colors">
              <Icon name="map-pin" className="text-[14px] text-accent" />
              <span>Sangkat Teuk Laork3, Khan Toul Kork, Phnom Penh, Cambodia</span>
            </a>
          </div>

          {/* Right: Socials & Language */}
          <div className="flex items-center gap-8 xl:gap-12">
            <div className="flex items-center gap-4">
              <a href="https://www.facebook.com/ptec.edu" target="_blank" rel="noreferrer" className="hover:text-white transition-colors" aria-label="Facebook">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/></svg>
              </a>
              <a href="https://www.youtube.com/@phnompenhteachereducationc3430" target="_blank" rel="noreferrer" className="hover:text-[#FF0000] transition-colors" aria-label="YouTube">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 0 0-1.95 1.96A29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58A2.78 2.78 0 0 0 3.41 19.6C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.95A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
              </a>
              <a href="https://www.ptec.edu.kh/" target="_blank" rel="noreferrer" className="hover:text-accent transition-colors" aria-label="Website">
                <Icon name="globe" className="text-[15px]" />
              </a>
            </div>
            <span className="opacity-30">|</span>
            <div className="flex items-center gap-2 font-medium tracking-wide">
              <span className="text-white border-b border-white pb-0.5 cursor-pointer">EN</span>
              <span className="opacity-50">|</span>
              <span className="hover:text-white transition-colors cursor-pointer">KH</span>
            </div>
          </div>
        </div>
      </div>

      <div className="relative border-b-[2px] border-accent z-10">
        <div className="flex justify-between items-center h-[72px] px-6 md:px-12 max-w-[1400px] mx-auto">
          {/* Logo + Nav links */}
          <div className="flex items-center gap-10">
            <Link
              href="/"
              className="flex items-center gap-3 group"
            >
              <Seal size={48} />
              <div className="hidden sm:flex flex-col text-text-heading group-hover:opacity-90 transition-opacity">
                <span className="font-khmer-serif font-bold text-[15px] leading-tight">បណ្ណាល័យ វ.គ.រ.ភ</span>
                <span className="font-serif font-bold text-sm tracking-wide mt-0.5">PTEC Library</span>
              </div>
            </Link>

            {/* Desktop nav links */}
            <div className="hidden lg:flex items-center gap-7 h-full pt-1">
              {navLinks.map((link) => (
                <NavLinkActive
                  key={link.href}
                  href={link.href}
                  label={link.label}
                  icon={link.icon}
                />
              ))}

              {/* About dropdown */}
              <NavDropdown
                label={aboutDropdown.label}
                href={aboutDropdown.href}
                icon={aboutDropdown.icon}
                subLinks={aboutDropdown.subLinks}
              />
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-6">
            {/* Search */}
            <NavSearch />

            {/* Bell (show only when logged in) */}
            {user && (
              <div className="hidden sm:flex items-center gap-4 border-l border-divider pl-6">
                <button
                  aria-label="Notifications"
                  className="relative text-text-muted transition-colors hover:text-brand"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                  </svg>
                  {/* Notification dot */}
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-danger" />
                </button>
              </div>
            )}

            {/* Login button OR Avatar dropdown — desktop only (lg+) */}
            <div className="hidden lg:block">
              <NavbarClient user={userInfo} />
            </div>

            {/* Hamburger + drawer — mobile/tablet only (below lg) */}
            <MobileMenu navLinks={mobileNavLinks} user={userInfo} />
          </div>

        </div>
      </div>
    </header>
  );
}