import Icon, { type IconName } from "@/components/ui/Icon";

const contactItems: [IconName, string][] = [
  ["phone", "012 950 192"],
  ["mail", "raksmeyron97@gmail.com"],
  ["clock", "Mon - Sat, 7 AM - 5 PM"],
  ["map-pin", "St.271, Khan Toul Kork, Phnom Penh"],
];

export default function ContactPage() {
  return (
    <section className="bg-slate-50 px-6 py-10 md:px-12">
      <div className="mx-auto grid max-w-[1100px] gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <div className="rounded-lg bg-[#0a1629] p-8 text-white">
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
        <form className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-950">Send a request</h2>
          <div className="mt-6 grid gap-4">
            <input className="h-12 rounded-md border border-slate-200 px-4 outline-none focus:border-[#007c91]" placeholder="Full name" />
            <input className="h-12 rounded-md border border-slate-200 px-4 outline-none focus:border-[#007c91]" placeholder="Email address" />
            <textarea className="min-h-36 rounded-md border border-slate-200 p-4 outline-none focus:border-[#007c91]" placeholder="How can the library help?" />
          </div>
          <button className="mt-5 rounded-md bg-[#0a1629] px-5 py-3 font-semibold text-white transition hover:bg-[#007c91]">
            Submit message
          </button>
        </form>
      </div>
    </section>
  );
}
