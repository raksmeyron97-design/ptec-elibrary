"use client";

import { useState, useEffect, ReactNode } from "react";

export default function NavbarStickyWrapper({ children }: { children: ReactNode }) {
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show sticky navbar when scrolled past the top strip (approx 40-50px)
      if (window.scrollY > 150) {
        setIsSticky(true);
      } else {
        setIsSticky(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    // Initial check
    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  return (
    <>
      {isSticky && <div className="h-[72px] w-full" aria-hidden="true" />}
      <div
        className={`w-full z-50 bg-bg-surface/95 backdrop-blur-md shadow-sm border-b-[2px] border-accent ${
          isSticky
            ? "fixed top-0 left-0 animate-in slide-in-from-top-full duration-300"
            : "relative"
        }`}
      >
        {children}
      </div>
    </>
  );
}
