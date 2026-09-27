"use client";
// Link a reader to their library card: find the reader (exact email), find
// the card (exact number — Koha answers), confirm in person, link. The server
// re-verifies everything; this component only collects the two strings.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog, StatusBadge, useToast } from "@/components/admin/kit";
import { BTN_PRIMARY, BTN_SECONDARY, Field } from "@/components/admin/kit/form";
import { findCard, findReader, linkCard, unlinkCard, type CardPatron, type Reader } from "../actions";

export type LinkRow = { profileId: string; name: string | null; email: string; cardHint: string; linkedAt: string };

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Asia/Phnom_Penh", dateStyle: "medium" }) : "—";

export default function LibraryCardsPanel({ rows, total }: { rows: LinkRow[]; total: number }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [reader, setReader] = useState<Reader | null | undefined>(undefined);
  const [card, setCard] = useState("");
  const [found, setFound] = useState<{ patron: CardPatron; linkedTo: string | null } | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState<LinkRow | null>(null);

  const reset = () => { setEmail(""); setReader(undefined); setCard(""); setFound(undefined); setError(null); };

  function lookReader(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError(null); setFound(undefined);
      const r = await findReader(email);
      if (r.ok) setReader(r.value); else setError(r.error);
    });
  }
  function lookCard(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      setError(null);
      const r = await findCard(card);
      if (r.ok) setFound(r.value); else setError(r.error);
    });
  }
  function link() {
    if (!reader) return;
    start(async () => {
      const r = await linkCard(reader.profileId, card);
      if (r.ok) { toast.success(r.value); reset(); router.refresh(); } else setError(r.error);
    });
  }
  function unlink() {
    if (!unlinking) return;
    start(async () => {
      const r = await unlinkCard(unlinking.profileId);
      setUnlinking(null);
      if (r.ok) { toast.success(r.value); router.refresh(); } else toast.error(r.error);
    });
  }

  const blocked = found?.linkedTo != null || !!reader?.linkedCard;

  return (
    <div className="space-y-6">
      <section className="space-y-4 rounded-xl border border-divider bg-bg-surface p-5">
        <h2 className="text-sm font-semibold text-text-heading">Link a card</h2>

        <form onSubmit={lookReader} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Reader's e-Library email" htmlFor="lc-email" className="min-w-0 flex-1">
            {(p) => <input {...p} type="email" value={email} onChange={(e) => { setEmail(e.target.value); setReader(undefined); }} autoComplete="off" />}
          </Field>
          <button type="submit" className={BTN_SECONDARY} disabled={pending || !email.trim()}>Find reader</button>
        </form>
        {reader === null && <p className="text-sm text-warning-text">No e-Library account has that email. The reader signs up first, then you link the card.</p>}
        {reader && (
          <p className="text-sm text-text-body">
            <span className="font-semibold">{reader.name ?? "(no name)"}</span> · {reader.email}
            {reader.linkedCard && <> · <StatusBadge tone="warning">already linked to {reader.linkedCard}</StatusBadge></>}
          </p>
        )}

        {reader && !reader.linkedCard && (
          <form onSubmit={lookCard} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field label="Library card number" htmlFor="lc-card" hint="Exactly as printed on the card." className="min-w-0 flex-1">
              {(p) => <input {...p} value={card} onChange={(e) => { setCard(e.target.value); setFound(undefined); }} autoComplete="off" className={`${p.className} font-mono`} />}
            </Field>
            <button type="submit" className={BTN_SECONDARY} disabled={pending || !card.trim()}>Find card in Koha</button>
          </form>
        )}
        {found === null && <p className="text-sm text-warning-text">Koha has no card with that number.</p>}
        {found && (
          <div className="space-y-2 rounded-lg border border-divider bg-paper p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">In Koha</p>
            <p className="text-base font-semibold text-text-heading">{found.patron.name}</p>
            <p className="text-text-body">
              Card <span className="font-mono">{found.patron.cardnumber}</span>
              {found.patron.categoryId && <> · category {found.patron.categoryId}</>}
              {found.patron.libraryId && <> · library {found.patron.libraryId}</>}
              {found.patron.expiryDate && <> · expires {when(found.patron.expiryDate)}</>}
            </p>
            <div className="flex flex-wrap gap-2">
              {found.patron.expired && <StatusBadge tone="warning">Card expired</StatusBadge>}
              {found.patron.restricted && <StatusBadge tone="warning">Restricted in Koha</StatusBadge>}
              {found.linkedTo && <StatusBadge tone="danger">Already linked to {found.linkedTo}</StatusBadge>}
            </div>
            <p className="text-xs text-text-muted">Link only if this is the person in front of you.</p>
            <div className="flex gap-3 pt-1">
              <button type="button" className={BTN_PRIMARY} onClick={link} disabled={pending || blocked}>Link this card</button>
              <button type="button" className={BTN_SECONDARY} onClick={reset} disabled={pending}>Start again</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="text-sm text-danger-text">{error}</p>}
      </section>

      <section className="rounded-xl border border-divider bg-bg-surface">
        <h2 className="border-b border-divider px-5 py-3 text-sm font-semibold text-text-heading">
          Linked readers <span className="font-normal text-text-muted">({total.toLocaleString()}{total > rows.length ? `, latest ${rows.length} shown` : ""})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="px-5 py-4 text-sm text-text-muted">No reader has a card linked yet.</p>
        ) : (
          <ul className="divide-y divide-divider">
            {rows.map((r) => (
              <li key={r.profileId} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:gap-4">
                <span className="min-w-0 flex-1"><span className="font-semibold text-text-heading">{r.name ?? "(no name)"}</span> <span className="text-text-muted">· {r.email}</span></span>
                <span className="font-mono text-text-body">{r.cardHint}</span>
                <span className="text-xs text-text-muted">linked {when(r.linkedAt)}</span>
                <button type="button" className={BTN_SECONDARY} onClick={() => setUnlinking(r)} disabled={pending}>Unlink</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={!!unlinking}
        title="Unlink this card?"
        description={unlinking ? <p>{unlinking.name ?? unlinking.email} will stop seeing their loans in My Library. Nothing changes in Koha.</p> : null}
        confirmLabel="Unlink"
        busyLabel="Unlinking…"
        busy={pending}
        onCancel={() => setUnlinking(null)}
        onConfirm={unlink}
      />
    </div>
  );
}
