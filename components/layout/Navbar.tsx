import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NavbarClient from "./NavbarClient";
import MobileMenu from "./MobileMenu";
import NavLinkActive from "./NavLinkActive";
import NavDropdown from "./NavDropdown";
import NavSearch from "@/components/layout/NavSearch";




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
    <line x1="2" y1="6" x2="2" y2="21"/><line x1="6" y1="6" x2="6" y2="21"/>
    <line x1="12" y1="6" x2="12" y2="21"/>
    <path d="M2 4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v2H2V4z"/>
    <rect x="8" y="10" width="8" height="11" rx="1"/>
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

    userInfo = {
      email:      user.email ?? "",
      full_name:  profile?.full_name  ?? null,
      avatar_url: profile?.avatar_url ?? null,
      role:       (profile?.role ?? "reader") as "reader" | "admin",
    };
  }

  return (
    <nav className="fixed top-0 w-full z-50 font-sans">
      {/* Background blur layer */}
      <div className="absolute inset-0 -z-10 border-b border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-md" />

      <div className="flex justify-between items-center h-[72px] px-6 md:px-12 max-w-[1400px] mx-auto">

        {/* Logo + Nav links */}
        <div className="flex items-center gap-10">
          <Link
            href="/"
            className="flex items-center gap-3 text-[22px] font-bold text-[#0a1629] tracking-wide group"
          >
            <Image
              src="/logo_top.png"
              alt="PTEC Logo"
              width={140}
              height={45}
              className="h-10 w-auto object-contain transition-transform group-hover:scale-105"
              priority
            />
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
            <div className="hidden sm:flex items-center gap-4 border-l border-slate-200 pl-6">
              <button
                aria-label="Notifications"
                className="relative text-slate-500 transition-colors hover:text-[#007c91]"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
                {/* Notification dot */}
                <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#ff6b35]" />
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
    </nav>
  );
}