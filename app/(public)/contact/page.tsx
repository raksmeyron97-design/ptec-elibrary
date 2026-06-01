"use client";

import { useState } from "react";
import Icon, { type IconName } from "@/components/ui/core/Icon";

const contactItems: [IconName, string][] = [
  ["phone", "012 950 192"],
  ["mail", "raksmeyron97@gmail.com"],
  ["clock", "Mon - Sat, 7 AM - 5 PM"],
  ["map-pin", "St.271, Khan Toul Kork, Phnom Penh"],
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
        <div className="rounded-lg bg-blue-950 p-8 text-white">
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
            <p className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              ✅ Your message was sent successfully!
            </p>
          )}

          {status === "error" && errorMsg && (
            <p className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              ⚠️ {errorMsg}
              {cooldownSeconds > 0 && (
                <span className="ml-1 font-bold">({cooldownSeconds}s)</span>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={isDisabled}
            className="mt-5 rounded-md bg-blue-950 px-5 py-3 font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status === "loading" ? "Sending…" : "Submit message"}
          </button>
        </form>
      </div>
    </section>
  );
}