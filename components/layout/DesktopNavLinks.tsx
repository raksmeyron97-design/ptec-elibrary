"use client";
// Desktop nav with sliding amber hover pill + clean minimal style
import { useState, useRef } from "react";
import NavLinkActive from "./NavLinkActive";
import NavDropdown from "./NavDropdown";
import DigitalLibraryDropdown from "./DigitalLibraryDropdown";

type SubLink = { label: string; href: string; icon?: React.ReactNode; target?: string };

type DesktopNavLinksProps = {
  navLinks: { label: string; href: string; icon: React.ReactNode }[];
  aboutDropdown:      { label: string; href: string; icon: React.ReactNode; subLinks: SubLink[] };
};

export default function DesktopNavLinks({
  navLinks,
  aboutDropdown,
}: DesktopNavLinksProps) {
  const [hoverStyle, setHoverStyle] = useState({ left: 0, width: 0, opacity: 0 });
  const containerRef = useRef<HTMLElement>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    const target  = e.currentTarget;
    const PADDING = 12;
    setHoverStyle({
      left:    target.offsetLeft - PADDING / 2,
      width:   target.offsetWidth + PADDING,
      opacity: 1,
    });
  };

  const handleMouseLeave = () => {
    setHoverStyle((prev) => ({ ...prev, opacity: 0 }));
  };

  return (
    <nav
      aria-label="Primary"
      ref={containerRef}
      className="hidden lg:flex items-center gap-0.5 xl:gap-1 h-full relative z-10"
      onMouseLeave={handleMouseLeave}
    >
      {/* Sliding amber hover pill */}
      <div
        className="absolute left-0 top-1/2 h-[36px] w-px rounded-lg pointer-events-none -z-10"
        style={{
          opacity: hoverStyle.opacity,
          transform: `translate3d(${hoverStyle.left}px, -50%, 0) scaleX(${Math.max(hoverStyle.width, 1)})`,
          transformOrigin: "left center",
          background: "color-mix(in srgb, rgb(245 158 11) 8%, transparent)",
          transition: "transform 150ms ease-out, opacity 100ms ease-out",
        }}
      />

      {navLinks.map((link) => (
        <div
          key={link.href}
          onMouseEnter={handleMouseEnter}
          className="h-full flex items-center px-3"
        >
          <NavLinkActive href={link.href} label={link.label} icon={link.icon} />
        </div>
      ))}

      <div onMouseEnter={handleMouseEnter} className="h-full flex items-center px-3">
        <DigitalLibraryDropdown />
      </div>

      <div onMouseEnter={handleMouseEnter} className="h-full flex items-center px-3">
        <NavDropdown
          label={aboutDropdown.label}
          href={aboutDropdown.href}
          icon={aboutDropdown.icon}
          subLinks={aboutDropdown.subLinks}
        />
      </div>
    </nav>
  );
}
