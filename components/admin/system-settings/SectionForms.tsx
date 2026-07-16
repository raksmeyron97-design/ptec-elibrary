"use client";

// The five section forms of the System Settings workspace. Purely controlled:
// each receives its document, an onChange, the current validation errors and
// a disabled flag; saving/publishing lives in SettingsWorkspace.

import { Plus, Trash2 } from "lucide-react";
import type {
  ContactSettings,
  FieldError,
  HoursSettings,
  LinksSettings,
  OrganizationSettings,
  SeoSettings,
} from "@/lib/system-settings/types";
import {
  normalizeKhPhone,
  phoneToIntlDisplay,
  phoneToTel,
} from "@/lib/system-settings/schemas";
import {
  hoursSentence,
  weeklyToOpeningHoursSpec,
} from "@/lib/system-settings/hours";
import { getLibraryStatus } from "@/lib/library-hours";
import {
  errorFor,
  FieldGroup,
  LocalizedFields,
  SectionIntro,
  TextField,
} from "./fields";

type FormProps<T> = {
  doc: T;
  onChange: (doc: T) => void;
  errors: FieldError[];
  disabled: boolean;
};

// ── Organization ─────────────────────────────────────────────────────────────

export function OrganizationForm({ doc, onChange, errors, disabled }: FormProps<OrganizationSettings>) {
  return (
    <div className="space-y-5">
      <SectionIntro
        title="Organization"
        description="Official institution and library names. These feed the header, footer brand block, page metadata and the schema.org organization data."
      />
      <FieldGroup title="Institution name">
        <LocalizedFields
          idBase="org-name"
          label="Official name"
          value={{ en: doc.name.en, km: doc.name.km }}
          onChange={(v) => onChange({ ...doc, name: { ...doc.name, ...v } })}
          errors={errors}
          pathBase="name"
          disabled={disabled}
          maxLength={160}
          usedIn="JSON-LD organization data · OAI-PMH publisher · About pages"
        />
        <TextField
          id="org-short"
          label="Abbreviation"
          value={doc.name.short}
          onChange={(short) => onChange({ ...doc, name: { ...doc.name, short } })}
          error={errorFor(errors, "name.short")}
          required
          disabled={disabled}
          maxLength={24}
          helper="Short form shown where space is tight (e.g. PTEC)."
        />
      </FieldGroup>
      <FieldGroup title="Library name">
        <LocalizedFields
          idBase="org-library"
          label="Library display name"
          value={doc.libraryName}
          onChange={(libraryName) => onChange({ ...doc, libraryName })}
          errors={errors}
          pathBase="libraryName"
          disabled={disabled}
          maxLength={160}
          usedIn="Footer brand block · JSON-LD library data"
        />
      </FieldGroup>
    </div>
  );
}

// ── Contact ──────────────────────────────────────────────────────────────────

export function ContactForm({ doc, onChange, errors, disabled }: FormProps<ContactSettings>) {
  const phonePreview = normalizeKhPhone(doc.phone);
  return (
    <div className="space-y-5">
      <SectionIntro
        title="Contact Information"
        description="Phone numbers, email addresses and the campus address shown across the public site."
      />
      <FieldGroup
        title="Phone"
        hint="Enter Cambodian numbers in local format — international and tel: formats are derived automatically."
      >
        <TextField
          id="contact-phone"
          label="Primary phone"
          type="tel"
          value={doc.phone}
          onChange={(phone) => onChange({ ...doc, phone })}
          error={errorFor(errors, "phone")}
          required
          disabled={disabled}
          maxLength={32}
          placeholder="012 345 678"
          usedIn="Header top bar · Footer · Contact page · Posts footer · JSON-LD"
        />
        {phonePreview && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Will display as <strong>{phoneToIntlDisplay(phonePreview)}</strong> · links as{" "}
            <code className="text-[11px]">{phoneToTel(phonePreview)}</code>
          </p>
        )}
        <TextField
          id="contact-phone-library"
          label="Library front desk phone"
          type="tel"
          value={doc.phoneLibrary}
          onChange={(phoneLibrary) => onChange({ ...doc, phoneLibrary })}
          error={errorFor(errors, "phoneLibrary")}
          required
          disabled={disabled}
          maxLength={32}
          helper="May be the same as the primary phone."
          usedIn="Library team page"
        />
      </FieldGroup>
      <FieldGroup title="Email">
        <TextField
          id="contact-email"
          label="Primary public email"
          type="email"
          value={doc.email}
          onChange={(email) => onChange({ ...doc, email })}
          error={errorFor(errors, "email")}
          required
          disabled={disabled}
          maxLength={254}
          usedIn="Header · Footer · Contact page · Email templates · Report-broken-file links"
        />
        <TextField
          id="contact-email-intl"
          label="International office email"
          type="email"
          value={doc.emailInternational}
          onChange={(emailInternational) => onChange({ ...doc, emailInternational })}
          error={errorFor(errors, "emailInternational")}
          disabled={disabled}
          maxLength={254}
        />
      </FieldGroup>
      <FieldGroup title="Address">
        <LocalizedFields
          idBase="contact-address"
          label="Full display address"
          value={{ en: doc.address.en, km: doc.address.km }}
          onChange={(v) => onChange({ ...doc, address: { ...doc.address, ...v } })}
          errors={errors}
          pathBase="address"
          disabled={disabled}
          maxLength={300}
          textarea
          usedIn="Footer · Contact page · Catalogs page · Posts footer"
        />
        <div className="grid gap-3 md:grid-cols-2">
          <TextField
            id="contact-street"
            label="Street address"
            value={doc.address.streetAddress}
            onChange={(streetAddress) =>
              onChange({ ...doc, address: { ...doc.address, streetAddress } })
            }
            error={errorFor(errors, "address.streetAddress")}
            required
            disabled={disabled}
            maxLength={160}
            helper="Structured value for schema.org PostalAddress."
          />
          <TextField
            id="contact-city"
            label="City"
            value={doc.address.city}
            onChange={(city) => onChange({ ...doc, address: { ...doc.address, city } })}
            error={errorFor(errors, "address.city")}
            required
            disabled={disabled}
            maxLength={80}
          />
          <TextField
            id="contact-country"
            label="Country code"
            value={doc.address.country}
            onChange={(country) => onChange({ ...doc, address: { ...doc.address, country } })}
            error={errorFor(errors, "address.country")}
            required
            disabled={disabled}
            maxLength={2}
            helper="ISO 2-letter code, e.g. KH."
          />
          <TextField
            id="contact-postal"
            label="Postal code"
            value={doc.address.postalCode}
            onChange={(postalCode) =>
              onChange({ ...doc, address: { ...doc.address, postalCode } })
            }
            error={errorFor(errors, "address.postalCode")}
            disabled={disabled}
            maxLength={12}
          />
        </div>
      </FieldGroup>
    </div>
  );
}

// ── Hours ────────────────────────────────────────────────────────────────────

const DAY_LABELS = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
// Editing order: Monday first (matches how the schedule is communicated).
const DAY_EDIT_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function HoursForm({ doc, onChange, errors, disabled }: FormProps<HoursSettings>) {
  const setDay = (day: number, intervals: HoursSettings["weekly"][string]) =>
    onChange({ ...doc, weekly: { ...doc.weekly, [String(day)]: intervals } });

  const spec = weeklyToOpeningHoursSpec(doc.weekly);
  const status = spec.length ? getLibraryStatus(new Date(), spec) : null;

  return (
    <div className="space-y-5">
      <SectionIntro
        title="Library Hours"
        description="Structured weekly schedule plus special closures. Every public hours display (footer, contact page, timings page, homepage open/closed badge, JSON-LD) derives from this — computed in Cambodia time (Asia/Phnom_Penh), never the visitor's timezone."
      />

      <FieldGroup title="Weekly schedule" hint="Leave a day without intervals to mark it closed.">
        <div className="space-y-3">
          {DAY_EDIT_ORDER.map((day) => {
            const key = String(day);
            const intervals = doc.weekly[key] ?? [];
            const dayError = errorFor(errors, `weekly.${key}`);
            return (
              <div key={day} className="rounded-xl border border-divider p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-slate-700">{DAY_LABELS[day]}</p>
                  <div className="flex items-center gap-2">
                    {intervals.length === 0 && (
                      <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                        Closed
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setDay(day, [...intervals, { open: "07:00", close: "17:00" }])}
                      className="inline-flex items-center gap-1 rounded-lg border border-divider px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-brand/40 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Plus className="h-3 w-3" aria-hidden="true" /> Add hours
                    </button>
                  </div>
                </div>
                {intervals.map((r, i) => (
                  <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-[11px] font-medium text-slate-500" htmlFor={`hours-${key}-${i}-open`}>
                      Opens
                    </label>
                    <input
                      id={`hours-${key}-${i}-open`}
                      type="time"
                      value={r.open}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = intervals.slice();
                        next[i] = { ...r, open: e.target.value };
                        setDay(day, next);
                      }}
                      className="rounded-lg border border-divider px-2 py-1.5 text-sm tabular-nums"
                    />
                    <label className="text-[11px] font-medium text-slate-500" htmlFor={`hours-${key}-${i}-close`}>
                      Closes
                    </label>
                    <input
                      id={`hours-${key}-${i}-close`}
                      type="time"
                      value={r.close}
                      disabled={disabled}
                      onChange={(e) => {
                        const next = intervals.slice();
                        next[i] = { ...r, close: e.target.value };
                        setDay(day, next);
                      }}
                      className="rounded-lg border border-divider px-2 py-1.5 text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => setDay(day, intervals.filter((_, j) => j !== i))}
                      aria-label={`Remove ${DAY_LABELS[day]} interval ${i + 1}`}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                    {errorFor(errors, `weekly.${key}.${i}.open`) && (
                      <p role="alert" className="w-full text-xs font-medium text-rose-600">
                        {errorFor(errors, `weekly.${key}.${i}.open`)}
                      </p>
                    )}
                    {errorFor(errors, `weekly.${key}.${i}.close`) && (
                      <p role="alert" className="w-full text-xs font-medium text-rose-600">
                        {errorFor(errors, `weekly.${key}.${i}.close`)}
                      </p>
                    )}
                  </div>
                ))}
                {dayError && (
                  <p role="alert" className="mt-2 text-xs font-medium text-rose-600">{dayError}</p>
                )}
              </div>
            );
          })}
        </div>
        {errorFor(errors, "weekly") && (
          <p role="alert" className="text-xs font-medium text-rose-600">
            {errorFor(errors, "weekly")}
          </p>
        )}
      </FieldGroup>

      <FieldGroup
        title="Special closures"
        hint="Public holidays or temporary closures. During a closure the site shows the library as closed with the reason."
      >
        {doc.closures.length === 0 && (
          <p className="text-sm text-slate-500">No special closures scheduled.</p>
        )}
        <div className="space-y-3">
          {doc.closures.map((cl, i) => (
            <div key={i} className="rounded-xl border border-divider p-3">
              <div className="flex flex-wrap items-end gap-3">
                <TextField
                  id={`closure-${i}-from`}
                  label="From"
                  type="date"
                  value={cl.from}
                  onChange={(from) => {
                    const closures = doc.closures.slice();
                    closures[i] = { ...cl, from };
                    onChange({ ...doc, closures });
                  }}
                  error={errorFor(errors, `closures.${i}.from`)}
                  required
                  disabled={disabled}
                />
                <TextField
                  id={`closure-${i}-to`}
                  label="To (inclusive)"
                  type="date"
                  value={cl.to}
                  onChange={(to) => {
                    const closures = doc.closures.slice();
                    closures[i] = { ...cl, to };
                    onChange({ ...doc, closures });
                  }}
                  error={errorFor(errors, `closures.${i}.to`)}
                  required
                  disabled={disabled}
                />
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange({ ...doc, closures: doc.closures.filter((_, j) => j !== i) })
                  }
                  className="mb-1 inline-flex items-center gap-1 rounded-lg border border-divider px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-rose-300 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                </button>
              </div>
              <div className="mt-3">
                <LocalizedFields
                  idBase={`closure-${i}-reason`}
                  label="Reason"
                  value={cl.reason}
                  onChange={(reason) => {
                    const closures = doc.closures.slice();
                    closures[i] = { ...cl, reason };
                    onChange({ ...doc, closures });
                  }}
                  errors={errors}
                  pathBase={`closures.${i}.reason`}
                  disabled={disabled}
                  maxLength={200}
                />
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() =>
            onChange({
              ...doc,
              closures: [
                ...doc.closures,
                { from: "", to: "", reason: { en: "", km: "" } },
              ],
            })
          }
          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-brand/50 hover:text-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden="true" /> Add closure
        </button>
      </FieldGroup>

      {/* Live preview — exactly what the public site will derive */}
      <div className="rounded-2xl border border-divider bg-slate-50 p-5">
        <h3 className="text-sm font-bold text-text-heading">Preview</h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              English sentence (footer, catalogs page)
            </dt>
            <dd className="text-slate-700">{hoursSentence("en", doc.weekly)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Khmer sentence
            </dt>
            <dd lang="km" className="font-kh text-slate-700">{hoursSentence("km", doc.weekly)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              schema.org spec (JSON-LD)
            </dt>
            <dd className="font-mono text-xs text-slate-600">{spec.join(" · ") || "—"}</dd>
          </div>
          {status && (
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Right now (Cambodia time)
              </dt>
              <dd>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    status.isOpen ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {status.isOpen ? "Open" : "Closed"}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
}

// ── Links ────────────────────────────────────────────────────────────────────

const LINK_FIELDS: {
  key: keyof LinksSettings;
  label: string;
  required: boolean;
  usedIn: string;
  helper?: string;
}[] = [
  { key: "website", label: "Official website", required: true, usedIn: "Header · Footer · Contact page · JSON-LD sameAs" },
  { key: "facebook", label: "Facebook page", required: true, usedIn: "Header · Footer · Contact page · JSON-LD sameAs" },
  { key: "messenger", label: "Messenger link", required: false, usedIn: "Contact page" },
  { key: "youtube", label: "YouTube channel", required: false, usedIn: "Header · Footer · Contact page · JSON-LD sameAs" },
  { key: "telegram", label: "Telegram channel", required: false, usedIn: "Library team page · JSON-LD sameAs" },
  { key: "mapPlace", label: "Google Maps place URL", required: true, usedIn: "Header · Footer 'Get directions' · Contact page · Catalogs page" },
  {
    key: "mapEmbed",
    label: "Google Maps embed URL",
    required: false,
    usedIn: "Footer map · Contact page map",
    helper: "The src of a Google Maps embed — must start with https://www.google.com/maps/embed. Paste only the URL, never iframe HTML.",
  },
];

export function LinksForm({ doc, onChange, errors, disabled }: FormProps<LinksSettings>) {
  return (
    <div className="space-y-5">
      <SectionIntro
        title="Social & External Links"
        description="Official profiles and map links. Only https:// URLs are accepted; script and embed HTML are rejected."
      />
      <FieldGroup title="Links">
        {LINK_FIELDS.map((f) => (
          <TextField
            key={f.key}
            id={`links-${f.key}`}
            label={f.label}
            type="url"
            value={doc[f.key]}
            onChange={(v) => onChange({ ...doc, [f.key]: v })}
            error={errorFor(errors, f.key)}
            required={f.required}
            disabled={disabled}
            maxLength={2000}
            helper={f.helper}
            usedIn={f.usedIn}
            placeholder="https://…"
          />
        ))}
      </FieldGroup>
    </div>
  );
}

// ── SEO ──────────────────────────────────────────────────────────────────────

export function SeoForm({ doc, onChange, errors, disabled }: FormProps<SeoSettings>) {
  return (
    <div className="space-y-5">
      <SectionIntro
        title="SEO & Sharing"
        description="Site-wide metadata defaults. Individual pages still override these — the values here are the fallback for the public site shell."
      />
      <FieldGroup title="Titles">
        <TextField
          id="seo-title"
          label="Default site title"
          value={doc.siteTitle}
          onChange={(siteTitle) => onChange({ ...doc, siteTitle })}
          error={errorFor(errors, "siteTitle")}
          required
          disabled={disabled}
          maxLength={70}
          usedIn="Browser tab · Search results · Social shares"
        />
        <TextField
          id="seo-template"
          label="Title template"
          value={doc.titleTemplate}
          onChange={(titleTemplate) => onChange({ ...doc, titleTemplate })}
          error={errorFor(errors, "titleTemplate")}
          required
          disabled={disabled}
          maxLength={70}
          helper='"%s" is replaced by the page title, e.g. "%s · PTEC Library".'
        />
        <TextField
          id="seo-site-name"
          label="Site name"
          value={doc.siteName}
          onChange={(siteName) => onChange({ ...doc, siteName })}
          error={errorFor(errors, "siteName")}
          required
          disabled={disabled}
          maxLength={70}
          usedIn="Structured data (WebSite / Library) · Email branding"
        />
      </FieldGroup>
      <FieldGroup title="Description">
        <LocalizedFields
          idBase="seo-description"
          label="Default meta description"
          value={doc.siteDescription}
          onChange={(siteDescription) => onChange({ ...doc, siteDescription })}
          errors={errors}
          pathBase="siteDescription"
          requiredKm={false}
          disabled={disabled}
          maxLength={300}
          textarea
          usedIn="Search results · Social share cards"
        />
        <p className="text-xs text-slate-500">
          Aim for 50–160 characters. If the Khmer description is empty, the English one is used.
        </p>
      </FieldGroup>

      {/* Search-result preview */}
      <div className="rounded-2xl border border-divider bg-slate-50 p-5">
        <h3 className="text-sm font-bold text-text-heading">Search preview</h3>
        <div className="mt-3 max-w-xl rounded-xl bg-white p-4 shadow-sm">
          <p className="truncate text-[13px] text-emerald-700">library.ptec.edu.kh</p>
          <p className="mt-0.5 truncate text-lg leading-snug text-blue-700">
            {doc.siteTitle || "Site title"}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-slate-600">
            {doc.siteDescription.en || "Default description appears here."}
          </p>
        </div>
      </div>
    </div>
  );
}
