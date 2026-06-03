"use client";

import { useState } from "react";
import Icon, { type IconName } from "@/components/ui/core/Icon";

const contactItems: [IconName, string][] = [
  ["phone", "012 950 192"],
  ["mail", "raksmeyron97@gmail.com"],
  ["clock", "Mon - Sat, 7 AM - 5 PM"],
  ["map-pin", "St.271, Khan Toul Kork, Phnom Penh"],
];

const socialLinks = [
  {
    name: "Telegram",
    href: "https://t.me/ptec_edu",
    colorClass: "text-[#2AABEE]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-12 h-12">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/>
      </svg>
    )
  },
  {
    name: "Facebook",
    href: "https://web.facebook.com/ptec.edu",
    colorClass: "text-[#1877F2]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-12 h-12">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    )
  },
  {
    name: "Messenger",
    href: "https://m.me/ptec.edu",
    colorClass: "text-[#00B2FF]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-12 h-12">
        <path d="M12 2C6.477 2 2 6.145 2 11.26c0 2.923 1.48 5.485 3.774 7.151.272.198.441.517.441.855v2.302c0 .546.602.875 1.066.578l2.671-1.706a1.006 1.006 0 0 1 .809-.133A10.3 10.3 0 0 0 12 20.52c5.523 0 10-4.145 10-9.26S17.523 2 12 2zm1.093 11.966l-2.427-2.593a.62.62 0 0 0-.898-.016l-3.328 3.518c-.461.486-1.22.022-.916-.593l2.846-5.748a.933.933 0 0 1 1.256-.411l2.433 1.233c.277.14.607.13.875-.028l3.415-2.022c.484-.287 1.037.3 1.037.3l-4.293 6.36z"/>
      </svg>
    )
  },
  {
    name: "Youtube",
    href: "https://www.youtube.com/@phnompenhteachereducationc3430",
    colorClass: "text-[#FF0000]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-12 h-12">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    )
  }
];

type Status = "idle" | "loading" | "success" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.secondsLeft) {
          setCooldownSeconds(data.secondsLeft);

          const interval = setInterval(() => {
            setCooldownSeconds((prev) => {
              if (prev <= 1) {
                clearInterval(interval);
                setStatus("idle");
                return 0;
              }
              return prev - 1;
            });
          }, 1000);
        }

        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  const isDisabled = status === "loading" || status === "success";

  return (
    <section className="bg-paper px-6 py-10 md:px-12">
      <div className="mx-auto grid max-w-[1100px] gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-lg bg-brand dark:bg-blue-900 p-8 text-brand-contrast dark:text-white dark:border dark:border-divider">
          <h1 className="text-3xl font-bold">Contact the library</h1>
          <div className="mt-8 space-y-5">
            {contactItems.map(([icon, text]) => (
              <div key={text} className="flex items-center gap-4">
                <Icon name={icon} className="text-2xl text-cyan-200" />
                <span>{text}</span>
              </div>
            ))}
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-divider bg-bg-surface p-8 shadow-sm"
        >
          <h2 className="text-2xl font-bold text-text-heading">Send a request</h2>

          <div className="mt-6 grid gap-4">
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isDisabled}
              className="h-12 rounded-md border border-divider px-4 outline-none focus:border-brand disabled:opacity-50"
              placeholder="Full name"
            />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isDisabled}
              className="h-12 rounded-md border border-divider px-4 outline-none focus:border-brand disabled:opacity-50"
              placeholder="Email address"
            />
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={isDisabled}
              className="min-h-36 rounded-md border border-divider p-4 outline-none focus:border-brand disabled:opacity-50"
              placeholder="How can the library help?"
            />
          </div>

          {status === "success" && (
            <p className="mt-4 rounded-md border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">
              ✅ Your message was sent successfully!
            </p>
          )}

          {status === "error" && errorMsg && (
            <p className="mt-4 rounded-md border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
              ⚠️ {errorMsg}
              {cooldownSeconds > 0 && (
                <span className="ml-1 font-bold">({cooldownSeconds}s)</span>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={isDisabled}
            className="mt-5 rounded-md bg-brand px-5 py-3 font-semibold text-brand-contrast transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Submit message"}
          </button>
        </form>
      </div>

      <div className="mx-auto mt-16 max-w-[1100px]">
        <div className="flex items-center gap-4 mb-8">
          <h2 className="text-2xl font-bold text-text-heading">Connect with us</h2>
          <div className="flex-1 h-px bg-divider"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          {socialLinks.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-4 p-5 rounded-2xl bg-bg-surface border border-divider shadow-sm hover:shadow-md hover:border-transparent hover:-translate-y-1 transition-all duration-300 relative overflow-hidden"
            >
              <div 
                className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${social.colorClass.replace('text-', 'bg-')}`} 
              />
              
              <div className={`transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6 ${social.colorClass}`}>
                {social.icon}
              </div>
              
              <span className="font-bold text-text-heading text-[17px] group-hover:translate-x-1 transition-transform duration-300">
                {social.name}
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
