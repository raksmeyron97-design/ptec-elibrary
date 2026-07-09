"use client";

import { useEffect, useRef, useState } from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import Icon, { type IconName } from "@/components/ui/core/Icon";
import { Button } from "@/components/ui/core/Button";
import { PTEC } from "@/lib/ptec";
import {
  validateContactInput,
  CONTACT_CATEGORIES,
  CONTACT_CATEGORY_LABELS,
  type ContactCategory,
} from "@/lib/contact/validate";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Library-specific phone (different from the main PTEC institution line) —
// single-sourced from lib/ptec.ts so the numbers can't drift between pages.
const LIBRARY_PHONE = PTEC.phoneLibrary;
// NOTE: email confirmed as info@ptec.edu.kh
const LIBRARY_EMAIL = PTEC.email;

const contactItems: { icon: IconName; label_km: string; label_en: string; value: string; href?: string }[] = [
  {
    icon: "phone",
    label_km: "ទូរស័ព្ទ",
    label_en: "Phone",
    value: LIBRARY_PHONE,
    href: `tel:${LIBRARY_PHONE.replace(/\s/g, "")}`,
  },
  {
    icon: "mail",
    label_km: "អ៊ីម៉ែល",
    label_en: "Email",
    value: LIBRARY_EMAIL,
    href: `mailto:${LIBRARY_EMAIL}`,
  },
  {
    icon: "clock",
    label_km: "ម៉ោងបើក",
    label_en: "Hours",
    value: "ច-សុ 7:00–17:00 · សៅ 8:00–16:00",
  },
  {
    icon: "map-pin",
    label_km: "អាសយដ្ឋាន",
    label_en: "Address",
    value: PTEC.address.en,
  },
];

// Contact persons provided by the library
const CONTACT_PERSONS: { km: string }[] = [
  { km: "បណ្ឌិត ឡឹក ជំនោរ" },
  { km: "លោក សុខ ធឿន" },
  { km: "លោក សិត សិក្ខាភិរ័ត" },
  { km: "លោក មុំ ចាន់ណា" },
  { km: "លោកស្រី នួម វីរ៉ាដែត" },
];

const socialLinks = [
  {
    name: "Facebook",
    href: PTEC.links.facebook,
    colorClass: "text-[#1877F2]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-10 h-10">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    name: "Telegram",
    href: PTEC.links.telegram,
    colorClass: "text-[#2AABEE]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-10 h-10">
        <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.14.18-.357.295-.6.295-.002 0-.003 0-.005 0l.213-3.054 5.56-5.022c.24-.213-.054-.334-.373-.121l-6.869 4.326-2.96-.924c-.64-.203-.658-.64.135-.954l11.566-4.458c.538-.196 1.006.128.832.94z"/>
      </svg>
    ),
  },
  {
    name: "Messenger",
    href: PTEC.links.messenger,
    colorClass: "text-[#00B2FF]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-10 h-10">
        <path d="M12 2C6.477 2 2 6.145 2 11.26c0 2.923 1.48 5.485 3.774 7.151.272.198.441.517.441.855v2.302c0 .546.602.875 1.066.578l2.671-1.706a1.006 1.006 0 0 1 .809-.133A10.3 10.3 0 0 0 12 20.52c5.523 0 10-4.145 10-9.26S17.523 2 12 2zm1.093 11.966l-2.427-2.593a.62.62 0 0 0-.898-.016l-3.328 3.518c-.461.486-1.22.022-.916-.593l2.846-5.748a.933.933 0 0 1 1.256-.411l2.433 1.233c.277.14.607.13.875-.028l3.415-2.022c.484-.287 1.037.3 1.037.3l-4.293 6.36z"/>
      </svg>
    ),
  },
  {
    name: "YouTube",
    href: PTEC.links.youtube,
    colorClass: "text-[#FF0000]",
    icon: (
      <svg fill="currentColor" viewBox="0 0 24 24" className="w-10 h-10">
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
      </svg>
    ),
  },
];

type Status = "idle" | "loading" | "success" | "error";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<ContactCategory | "">("");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [captchaToken, setCaptchaToken] = useState<string | undefined>(undefined);
  const turnstileRef = useRef<TurnstileInstance>(null);
  // Anti-bot: honeypot field (must stay empty) + form render time (server
  // rejects submissions faster than a human could type).
  const [website, setWebsite] = useState("");
  const formTimeRef = useRef(0);
  useEffect(() => {
    formTimeRef.current = Date.now();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const { valid, errors } = validateContactInput({ name, email, phone, subject, category, message });
    if (!valid) {
      setFieldErrors(errors);
      setStatus("error");
      setErrorMsg("Please fix the highlighted fields and try again.");
      return;
    }
    setFieldErrors({});
    setStatus("loading");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          phone,
          subject,
          category,
          message,
          turnstileToken: captchaToken,
          website,
          formTime: formTimeRef.current,
        }),
      });

      const data = await res.json();

      turnstileRef.current?.reset();
      setCaptchaToken(undefined);

      if (!res.ok) {
        if (res.status === 429 && data.secondsLeft) {
          setCooldownSeconds(data.secondsLeft);
          const interval = setInterval(() => {
            setCooldownSeconds((prev) => {
              if (prev <= 1) { clearInterval(interval); setStatus("idle"); return 0; }
              return prev - 1;
            });
          }, 1000);
        }
        setErrorMsg(data.error || "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }

      setStatus("success");
      setName(""); setEmail(""); setPhone(""); setSubject(""); setCategory(""); setMessage("");
    } catch {
      setStatus("error");
      setErrorMsg("Network error. Please check your connection and try again.");
    }
  }

  const isDisabled = status === "loading" || status === "success";
  const captchaPending = Boolean(TURNSTILE_SITE_KEY) && !captchaToken;

  return (
    <div className="min-h-screen bg-paper">
      {/* ── Hero ─────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#2A47A6 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
            backgroundSize: "24px 24px",
          }}
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-3xl px-6 py-14 md:py-20 text-center">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em]" style={{ color: "#DDB022" }}>
            ទំនាក់ទំនង · Get in Touch
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-white leading-tight">
            Contact the Library
            <span className="font-kh ml-3 text-2xl md:text-3xl text-white/75" lang="km">ទំនាក់ទំនង</span>
          </h1>
          <p className="mt-3 text-sm text-white/60 max-w-sm mx-auto">
            Reach out by phone, email, or visit us in person. We&apos;re here to help.
          </p>
        </div>
      </section>

      <div className="mx-auto max-w-[1100px] px-4 md:px-8 pb-20 mt-10 space-y-14">

        {/* ── Contact info + form ───────────────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
          {/* Info sidebar */}
          <div
            className="rounded-2xl p-7 text-white relative overflow-hidden"
            style={{ background: "linear-gradient(135deg,#1E3A8A 0%,#122251 100%)" }}
          >
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage: "radial-gradient(circle,white 1px,transparent 1px)",
                backgroundSize: "20px 20px",
              }}
              aria-hidden="true"
            />
            <h2 className="relative text-xl font-bold text-white mb-6">
              <span className="font-kh" lang="km">ព័ត៌មានទំនាក់ទំនង</span>
              <span className="block text-sm font-normal text-white/60 mt-0.5">Contact Information</span>
            </h2>
            <div className="relative space-y-5">
              {contactItems.map((item) => (
                <div key={item.label_en} className="flex items-start gap-4">
                  <div
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10"
                    aria-hidden="true"
                  >
                    <Icon name={item.icon} className="text-[16px]" style={{ color: "#DDB022" }} />
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-white/50 mb-0.5">
                      <span className="font-kh" lang="km">{item.label_km}</span> · {item.label_en}
                    </p>
                    {item.href ? (
                      <a
                        href={item.href}
                        className="text-sm text-white/90 hover:text-white transition-colors cursor-pointer"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="font-kh text-sm text-white/90 leading-relaxed" lang="km">
                        {item.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Website link */}
            <div className="relative mt-6 pt-6 border-t border-white/10">
              <a
                href={PTEC.links.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                {PTEC.links.website.replace("https://", "")}
              </a>
              <a
                href={PTEC.links.facebook}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 flex items-center gap-2 text-sm text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>
                </svg>
                facebook.com/ptec.edu
              </a>
            </div>
          </div>

          {/* Contact form */}
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-divider bg-bg-surface p-7 shadow-sm"
          >
            <h2 className="text-xl font-bold text-text-heading mb-1">Send a request</h2>
            <p className="text-sm text-text-muted mb-6">
              <span className="font-kh" lang="km">សូមផ្ញើសំណូមពររបស់អ្នក</span>
            </p>

            {/* Honeypot — visually hidden from humans, tempting to bots.
                Kept off-screen (not display:none) so naive bots still fill it. */}
            <div aria-hidden="true" className="absolute -left-[9999px] top-auto h-px w-px overflow-hidden">
              <label htmlFor="contact-website">Website</label>
              <input
                id="contact-website"
                name="website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
              />
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                    Full name <span className="text-danger">*</span>
                  </label>
                  <input
                    id="contact-name"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isDisabled}
                    aria-invalid={Boolean(fieldErrors.name)}
                    className={`h-11 w-full rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading ${fieldErrors.name ? "border-danger" : "border-divider focus:border-brand"}`}
                    placeholder="Your full name"
                  />
                  {fieldErrors.name && <p className="mt-1 text-xs text-danger">{fieldErrors.name}</p>}
                </div>
                <div>
                  <label htmlFor="contact-email" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                    Email address <span className="text-danger">*</span>
                  </label>
                  <input
                    id="contact-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isDisabled}
                    aria-invalid={Boolean(fieldErrors.email)}
                    className={`h-11 w-full rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading ${fieldErrors.email ? "border-danger" : "border-divider focus:border-brand"}`}
                    placeholder="your@email.com"
                  />
                  {fieldErrors.email && <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="contact-phone" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                    Phone <span className="normal-case font-normal text-text-muted/70">(optional)</span>
                  </label>
                  <input
                    id="contact-phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isDisabled}
                    aria-invalid={Boolean(fieldErrors.phone)}
                    className={`h-11 w-full rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading ${fieldErrors.phone ? "border-danger" : "border-divider focus:border-brand"}`}
                    placeholder="012 345 678"
                  />
                  {fieldErrors.phone && <p className="mt-1 text-xs text-danger">{fieldErrors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="contact-category" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                    Category <span className="text-danger">*</span>
                  </label>
                  <select
                    id="contact-category"
                    required
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ContactCategory)}
                    disabled={isDisabled}
                    aria-invalid={Boolean(fieldErrors.category)}
                    className={`h-11 w-full rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading ${fieldErrors.category ? "border-danger" : "border-divider focus:border-brand"}`}
                  >
                    <option value="" disabled>Select a category…</option>
                    {CONTACT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CONTACT_CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  {fieldErrors.category && <p className="mt-1 text-xs text-danger">{fieldErrors.category}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="contact-subject" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                  Subject <span className="text-danger">*</span>
                </label>
                <input
                  id="contact-subject"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  disabled={isDisabled}
                  aria-invalid={Boolean(fieldErrors.subject)}
                  className={`h-11 w-full rounded-xl border px-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading ${fieldErrors.subject ? "border-danger" : "border-divider focus:border-brand"}`}
                  placeholder="Brief summary of your request"
                />
                {fieldErrors.subject && <p className="mt-1 text-xs text-danger">{fieldErrors.subject}</p>}
              </div>

              <div>
                <label htmlFor="contact-message" className="block text-xs font-semibold text-text-muted mb-1.5 uppercase tracking-wide">
                  Message <span className="text-danger">*</span>
                </label>
                <textarea
                  id="contact-message"
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  disabled={isDisabled}
                  aria-invalid={Boolean(fieldErrors.message)}
                  className={`min-h-32 w-full rounded-xl border p-4 text-sm outline-none focus:ring-2 focus:ring-brand/10 disabled:opacity-50 bg-bg-surface text-text-heading resize-none ${fieldErrors.message ? "border-danger" : "border-divider focus:border-brand"}`}
                  placeholder="How can the library help?"
                />
                {fieldErrors.message && <p className="mt-1 text-xs text-danger">{fieldErrors.message}</p>}
              </div>
            </div>

            {TURNSTILE_SITE_KEY && (
              <div className="mt-4">
                <Turnstile
                  ref={turnstileRef}
                  siteKey={TURNSTILE_SITE_KEY}
                  onSuccess={setCaptchaToken}
                  onExpire={() => setCaptchaToken(undefined)}
                  onError={() => setCaptchaToken(undefined)}
                />
              </div>
            )}

            {status === "success" && (
              <p className="mt-4 rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">
                Your message was sent successfully!
              </p>
            )}
            {status === "error" && errorMsg && (
              <p className="mt-4 rounded-xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
                {errorMsg}
                {cooldownSeconds > 0 && (
                  <span className="ml-1 font-bold">({cooldownSeconds}s)</span>
                )}
              </p>
            )}

            <Button type="submit" disabled={isDisabled || captchaPending} className="mt-5">
              {status === "loading" ? "Sending…" : "Submit message"}
            </Button>
          </form>
        </div>

        {/* ── Google Maps + Contact Persons ──────────────────── */}
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Map */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-4">
              <div
                className="h-7 w-1.5 shrink-0 rounded-full"
                style={{ background: "linear-gradient(135deg,#1E3A8A,#3A5FC4)" }}
                aria-hidden="true"
              />
              <h2 className="text-lg font-bold text-text-heading">
                <span className="font-kh" lang="km">ទីតាំង</span> · Find Us
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-divider shadow-sm">
              <iframe
                src={PTEC.links.mapEmbed}
                width="100%"
                height="340"
                style={{ border: 0, display: "block" }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                title="PTEC Library location on Google Maps"
              />
            </div>
            <a
              href={PTEC.links.mapPlace}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 cursor-pointer"
              style={{ background: "linear-gradient(135deg,#DDB022,#BE9412)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
              <span className="font-kh" lang="km">ទទួលការណែនាំ</span>
              <span>· Get Directions</span>
            </a>
          </div>

          {/* Contact persons */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div
                className="h-7 w-1.5 shrink-0 rounded-full"
                style={{ background: "linear-gradient(135deg,#DDB022,#BE9412)" }}
                aria-hidden="true"
              />
              <h2 className="text-lg font-bold text-text-heading">
                <span className="font-kh" lang="km">បុគ្គលទំនាក់ទំនង</span>
                <span className="block text-xs font-normal text-text-muted mt-0.5">Contact Persons</span>
              </h2>
            </div>
            <ul className="space-y-3" role="list">
              {CONTACT_PERSONS.map((person, idx) => (
                <li
                  key={idx}
                  className="flex items-center gap-3 rounded-xl border border-divider bg-bg-surface px-4 py-3"
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white text-xs font-bold"
                    style={{
                      background:
                        idx % 2 === 0
                          ? "linear-gradient(135deg,#1E3A8A,#2A47A6)"
                          : "linear-gradient(135deg,#DDB022,#BE9412)",
                    }}
                    aria-hidden="true"
                  >
                    {idx + 1}
                  </div>
                  <span className="font-kh text-sm font-semibold text-text-heading" lang="km">
                    {person.km}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ── Social links ───────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-4 mb-6">
            <h2 className="text-lg font-bold text-text-heading">
              <span className="font-kh" lang="km">ចូលរួមជាមួយយើង</span> · Connect with us
            </h2>
            <div className="flex-1 h-px bg-divider" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {socialLinks.map((social) => (
              <a
                key={social.name}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-3 p-4 rounded-2xl bg-bg-surface border border-divider shadow-sm hover:shadow-md hover:border-transparent hover:-translate-y-1 transition-all duration-300 cursor-pointer relative overflow-hidden"
              >
                <div
                  className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-300 ${social.colorClass.replace("text-", "bg-")}`}
                  aria-hidden="true"
                />
                <div className={`transition-transform duration-300 group-hover:scale-110 ${social.colorClass}`}>
                  {social.icon}
                </div>
                <span className="font-bold text-text-heading text-sm group-hover:translate-x-0.5 transition-transform duration-300">
                  {social.name}
                </span>
              </a>
            ))}
          </div>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-3" aria-hidden="true">
          <div className="h-px w-16 bg-gradient-to-r from-transparent to-blue-700/40" />
          <div className="h-2 w-2 rounded-full" style={{ backgroundColor: "#DDB022" }} />
          <div className="h-px w-16 bg-gradient-to-l from-transparent to-blue-700/40" />
        </div>

      </div>
    </div>
  );
}
