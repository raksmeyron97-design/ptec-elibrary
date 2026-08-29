"use client";

// Event investigation. Answers, in order: what was decided, when, to whom,
// about what, why, and — last, because it is for debugging rather than for
// operating — which table the row came from.
//
// Every field is rendered only when it has a value. A drawer of "—" rows reads
// as a broken record; an absent section correctly says "this kind of event does
// not carry that".
//
// Privacy: `actorEmail` arrives already masked for admins without the reveal
// privilege (masked at the server boundary in page.tsx, so the raw value is not
// in the payload at all). The Reveal control is a separate, audited server
// action and is only offered to callers the server said may use it.

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import type { ActivityEvent } from "@/lib/admin/activity-log-shared";
import { revealReaderContact } from "../actions";
import { INK, INK2, INK3, LINE, LINE_SUBTLE, STATUS_TONE, TONE, ResourceBadge, StatusBadge, btnSecondary, srOnly, CloseIcon } from "./logs-ui";
import type { TimeParts } from "./time";

type Revealed = Extract<Awaited<ReturnType<typeof revealReaderContact>>, { ok: true }>;

export default function ActivityDetailDrawer({
  event, canSeePersonal, onClose, fmt,
}: {
  event: ActivityEvent;
  canSeePersonal: boolean;
  onClose: () => void;
  fmt: (iso: string) => TimeParts;
}) {
  const t = useTranslations("adminLogs");
  const panelRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [revealing, setRevealing] = useState(false);
  const time = fmt(event.occurredAt);
  const tone = TONE[STATUS_TONE[event.eventStatus] ?? "neutral"];

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      // Keep Tab inside the dialog: a modal you can tab out of leaves the
      // reader operating a page they cannot see.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); previouslyFocused?.focus?.(); };
  }, [onClose]);

  const copyId = async () => {
    try { await navigator.clipboard?.writeText(event.id); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* clipboard unavailable — the id is still selectable */ }
  };

  const doReveal = async () => {
    if (!event.userId) return;
    setRevealing(true);
    try {
      const result = await revealReaderContact(event.userId);
      if (result.ok) setRevealed(result);
    } finally {
      setRevealing(false);
    }
  };

  const headline =
    event.eventType === "download"
      ? t(`headline.download_${event.eventStatus}`)
      : t(`headline.${event.eventType}`);

  const hasDecision = event.eventType === "download" || !!event.denialReason || !!event.permissionSource || event.rankAtEvent != null;
  const hasContext = !!event.institutionType || !!event.role || !!event.purpose || !!event.locale;

  return (
    <>
      <div className="dash-drawer-scrim" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={t("drawer.title")}
        className="dash-drawer logs-drawer"
        style={{ outline: "none" }}
      >
        <header style={{ position: "sticky", top: 0, zIndex: 1, background: "var(--dash-surface)", borderBottom: `1px solid ${LINE}`, padding: "15px 18px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".07em", textTransform: "uppercase", color: INK3 }}>{t("drawer.title")}</span>
            <h2 style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.015em", color: tone.text, lineHeight: 1.3 }}>{headline}</h2>
            <StatusBadge status={event.eventStatus} label={t(`status.${event.eventStatus}`)} size="sm" />
          </div>
          <button type="button" onClick={onClose} aria-label={t("drawer.close")}
            style={{ border: `1px solid ${LINE}`, background: LINE_SUBTLE, borderRadius: 9, width: 32, height: 32, display: "grid", placeItems: "center", cursor: "pointer", color: INK2, flex: "none" }}>
            <CloseIcon size={14} />
          </button>
        </header>

        <div style={{ padding: "16px 18px 28px", overflowY: "auto", display: "flex", flexDirection: "column", gap: 20 }}>
          <Section title={t("drawer.when")}>
            <p style={{ fontSize: 14, fontWeight: 600, color: INK }}>{time.exact}</p>
            <p style={{ fontSize: 12, color: INK3 }}>{time.relative} · Asia/Phnom_Penh</p>
          </Section>

          <Section title={t("drawer.actor")}>
            {event.isAnon ? (
              <p style={{ fontSize: 13, color: INK2, fontStyle: "italic" }}>{t("anon")}</p>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <Avatar url={event.actorAvatar} name={event.actorName} email={event.actorEmail ?? ""} size={38} />
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: INK }} className="dash-truncate">{revealed?.fullName ?? event.actorName ?? t("drawer.notAvailable")}</p>
                    <p style={{ fontSize: 12.5, color: INK3 }} className="dash-truncate">{revealed?.email ?? event.actorEmail ?? t("drawer.notAvailable")}</p>
                  </div>
                </div>
                {revealed && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
                    <Field label={t("drawer.phone")} value={revealed.phone} />
                    <Field label={t("drawer.gender")} value={revealed.gender} />
                    <Field label={t("drawer.faculty")} value={revealed.faculty} />
                    <Field label={t("drawer.country")} value={revealed.country} />
                  </div>
                )}
                {canSeePersonal && event.userId && !revealed && (
                  <button type="button" onClick={doReveal} disabled={revealing} style={{ ...btnSecondary, height: 32, fontSize: 12.5, marginTop: 10 }}>
                    {revealing ? t("drawer.revealing") : t("drawer.reveal")}
                  </button>
                )}
                {!canSeePersonal && <p style={{ fontSize: 11.5, color: INK3, marginTop: 8, lineHeight: 1.55 }}>{t("drawer.revealHint")}</p>}
              </>
            )}
          </Section>

          <Section title={t("drawer.resourceInfo")}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span><ResourceBadge type={event.resourceType} label={t(`resource.${event.resourceType}`)} /></span>
              <p style={{ fontSize: 14, fontWeight: 600, color: INK, lineHeight: 1.45, wordBreak: "break-word" }}>
                {event.resourceTitle ?? t("resource.unknown")}
              </p>
              {event.resourceId && <p style={{ fontSize: 11.5, color: INK3, fontFamily: "ui-monospace, monospace", wordBreak: "break-all" }}>{event.resourceId}</p>}
            </div>
          </Section>

          {hasDecision && (
            <Section title={t("drawer.decision")}>
              <Field label={t("drawer.statusLabel")} value={t(`status.${event.eventStatus}`)} />
              {event.denialReason && <Field label={t("drawer.permissionReason")} value={t(`reason.${event.denialReason}`)} />}
              {/* Stable DB values ('automatic-ranking' / 'admin-override') get a
                  translated label; anything a future writer emits falls back to
                  the raw value rather than rendering a missing-key error. */}
              {event.permissionSource && (
                <Field
                  label={t("drawer.permissionSource")}
                  value={t.has(`permissionSource.${event.permissionSource}`) ? t(`permissionSource.${event.permissionSource}`) : event.permissionSource}
                />
              )}
              {event.rankAtEvent != null && <Field label={t("drawer.rankAtEvent")} value={`#${event.rankAtEvent}`} />}
            </Section>
          )}

          {hasContext && (
            <Section title={t("drawer.context")}>
              <Field label={t("drawer.institutionType")} value={event.institutionType} />
              <Field label={t("drawer.role")} value={event.role} />
              <Field label={t("drawer.purpose")} value={event.purpose} />
              <Field label={t("drawer.locale")} value={event.locale} />
            </Section>
          )}

          {/* Traceability, deliberately last and deliberately not in the table:
              `source` is how an engineer finds the row, not how an
              administrator understands the event. */}
          <Section title={t("drawer.system")}>
            <Field label={t("drawer.source")} value={event.source} mono />
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 12.5, color: INK3, flex: "none" }}>{t("drawer.eventId")}</span>
              <button type="button" onClick={copyId} aria-label={t("drawer.copyEventId")}
                style={{ fontFamily: "ui-monospace, monospace", fontSize: 11.5, color: INK2, background: LINE_SUBTLE, border: `1px solid ${LINE}`, borderRadius: 7, padding: "3px 8px", cursor: "pointer", maxWidth: "62%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {copied ? t("drawer.copied") : event.id}
              </button>
            </div>
            <span role="status" aria-live="polite" style={srOnly}>{copied ? t("drawer.copied") : ""}</span>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 style={{ fontSize: 10.5, fontWeight: 700, color: INK3, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 9 }}>{title}</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </section>
  );
}

/** Renders nothing at all when there is no value — see the header comment. */
function Field({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
      <span style={{ fontSize: 12.5, color: INK3, flex: "none" }}>{label}</span>
      <span style={{ fontSize: 13, color: INK, textAlign: "end", wordBreak: "break-word", fontFamily: mono ? "ui-monospace, monospace" : undefined }}>{value}</span>
    </div>
  );
}
