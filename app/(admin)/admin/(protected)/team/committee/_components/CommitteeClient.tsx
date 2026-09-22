"use client";

import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Pencil,
  Search,
  UserPlus,
  UserMinus,
  UsersRound,
  X,
} from "lucide-react";

import { useCan } from "@/components/admin/access/AdminCapabilities";
import { ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";
import {
  addCommitteeMember,
  removeCommitteeMember,
  reorderCommitteeMember,
  toggleCommitteeMemberPublished,
  updateCommitteeMember,
  type ActionResult,
  type CommitteeCandidate,
  type CommitteeMemberRow,
  type CommitteeSectionRow,
} from "../actions";

/**
 * The committee roster, as an editor works with it: grouped by section, in the
 * order the public page will use, with the person's own record visible but
 * never editable from here.
 *
 * What this component deliberately does NOT do is offer a second way to create
 * a person. "Add a committee member" searches the people who already exist;
 * when the person is missing it sends the editor to the existing team form
 * rather than growing a parallel one that would have to reimplement photo
 * upload, bilingual identity, education, account linking and publishing.
 */

type Props = {
  seats: CommitteeMemberRow[];
  sections: CommitteeSectionRow[];
  candidates: CommitteeCandidate[];
};

type SeatDraft = {
  committee_section_id: string;
  role_km: string;
  role_en: string;
  responsibility_km: string;
  responsibility_en: string;
  display_order: string;
  is_published: boolean;
};

const EMPTY_DRAFT: SeatDraft = {
  committee_section_id: "",
  role_km: "",
  role_en: "",
  responsibility_km: "",
  responsibility_en: "",
  display_order: "0",
  is_published: false,
};

function draftFrom(seat: CommitteeMemberRow): SeatDraft {
  return {
    committee_section_id: seat.committee_section_id ?? "",
    role_km: seat.role_km ?? "",
    role_en: seat.role_en ?? "",
    responsibility_km: seat.responsibility_km ?? "",
    responsibility_en: seat.responsibility_en ?? "",
    display_order: String(seat.display_order ?? 0),
    is_published: seat.is_published,
  };
}

function toFormData(draft: SeatDraft, teamMemberId?: string): FormData {
  const data = new FormData();
  if (teamMemberId) data.set("team_member_id", teamMemberId);
  data.set("committee_section_id", draft.committee_section_id);
  data.set("role_km", draft.role_km);
  data.set("role_en", draft.role_en);
  data.set("responsibility_km", draft.responsibility_km);
  data.set("responsibility_en", draft.responsibility_en);
  data.set("display_order", draft.display_order);
  data.set("is_published", draft.is_published ? "true" : "false");
  return data;
}

function personLabel(person: CommitteeMemberRow["person"]): string {
  if (!person) return "Removed team member";
  return person.name_en || person.name_km || "Unnamed member";
}

export default function CommitteeClient({ seats, sections, candidates }: Props) {
  const router = useRouter();
  const toast = useToast();
  /* `users: write`. A read-only viewer keeps the whole roster — portraits,
     roles, sections, publish state — and none of the controls that change it.
     Every one of these calls a Server Action that re-checks the same policy. */
  const canManage = useCan("team.committee.manage");

  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<
    { mode: "add" } | { mode: "edit"; seat: CommitteeMemberRow } | null
  >(null);
  const [confirmRemove, setConfirmRemove] = useState<CommitteeMemberRow | null>(null);

  const groups = useMemo(() => {
    const bySection = new Map<string, CommitteeMemberRow[]>();
    for (const seat of seats) {
      const key = seat.committee_section_id ?? "";
      const list = bySection.get(key) ?? [];
      list.push(seat);
      bySection.set(key, list);
    }
    const ordered = sections.map((section) => ({
      section,
      seats: bySection.get(section.id) ?? [],
    }));
    const unsectioned = bySection.get("") ?? [];
    return { ordered, unsectioned };
  }, [seats, sections]);

  function run(id: string | null, action: () => Promise<ActionResult>, success: string) {
    setBusyId(id);
    startTransition(async () => {
      const result = await action();
      setBusyId(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  }

  const availableCandidates = candidates.filter((c) => !c.onCommittee);

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            {seats.length === 0
              ? "No one is on the committee yet."
              : `${seats.length} seat${seats.length === 1 ? "" : "s"}, ordered as readers will see them.`}
          </p>
          <button
            type="button"
            onClick={() => setDialog({ mode: "add" })}
            className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add committee member
          </button>
        </div>
      )}

      {seats.length === 0 ? (
        <EmptyState
          icon={<UsersRound className="h-6 w-6" />}
          title="No committee members yet"
          description={
            canManage
              ? "Add someone from the team directory. Their name, portrait and profile all stay on their existing record."
              : "Committee membership has not been set up yet."
          }
          action={
            canManage ? (
              <button
                type="button"
                onClick={() => setDialog({ mode: "add" })}
                className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-blue-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand"
              >
                <UserPlus className="h-4 w-4" aria-hidden="true" />
                Add committee member
              </button>
            ) : null
          }
        />
      ) : (
        <>
          {groups.ordered.map(({ section, seats: sectionSeats }) => (
            <SectionPanel
              key={section.id}
              title={
                <>
                  <span className="font-kh text-sm font-bold text-text-heading" lang="km">
                    {section.name_km}
                  </span>
                  <span className="mx-2 text-text-muted" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-sm font-semibold text-text-heading">{section.name_en}</span>
                </>
              }
              meta={
                <>
                  <span className="rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    {section.layout_variant === "leadership" ? "Leadership layout" : "Grid layout"}
                  </span>
                  {!section.is_active && (
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                      Hidden
                    </span>
                  )}
                  <span className="rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                    {sectionSeats.length}
                  </span>
                </>
              }
            >
              {sectionSeats.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-text-muted">
                  No committee members in this section yet.
                </p>
              ) : (
                sectionSeats.map((seat, index) => (
                  <SeatRow
                    key={seat.id}
                    seat={seat}
                    index={index}
                    total={sectionSeats.length}
                    canManage={canManage}
                    busy={busyId === seat.id}
                    isPending={isPending}
                    onEdit={() => setDialog({ mode: "edit", seat })}
                    onRemove={() => setConfirmRemove(seat)}
                    onTogglePublish={(next) =>
                      run(
                        seat.id,
                        () => toggleCommitteeMemberPublished(seat.id, next),
                        next ? "Published on the committee page." : "Removed from the public page.",
                      )
                    }
                    onReorder={(direction) =>
                      run(seat.id, () => reorderCommitteeMember(seat.id, direction), "Order saved.")
                    }
                  />
                ))
              )}
            </SectionPanel>
          ))}

          {groups.unsectioned.length > 0 && (
            <SectionPanel
              title={<span className="text-sm font-semibold text-text-heading">No section</span>}
              meta={
                <span className="rounded-full border border-divider bg-paper px-2.5 py-0.5 text-xs font-semibold text-text-muted">
                  {groups.unsectioned.length}
                </span>
              }
            >
              {groups.unsectioned.map((seat, index) => (
                <SeatRow
                  key={seat.id}
                  seat={seat}
                  index={index}
                  total={groups.unsectioned.length}
                  canManage={canManage}
                  busy={busyId === seat.id}
                  isPending={isPending}
                  onEdit={() => setDialog({ mode: "edit", seat })}
                  onRemove={() => setConfirmRemove(seat)}
                  onTogglePublish={(next) =>
                    run(
                      seat.id,
                      () => toggleCommitteeMemberPublished(seat.id, next),
                      next ? "Published on the committee page." : "Removed from the public page.",
                    )
                  }
                  onReorder={(direction) =>
                    run(seat.id, () => reorderCommitteeMember(seat.id, direction), "Order saved.")
                  }
                />
              ))}
            </SectionPanel>
          )}
        </>
      )}

      {dialog && (
        <SeatDialog
          mode={dialog.mode}
          seat={dialog.mode === "edit" ? dialog.seat : null}
          sections={sections}
          candidates={availableCandidates}
          busy={isPending}
          onClose={() => setDialog(null)}
          onSubmit={(draft, teamMemberId) => {
            const action =
              dialog.mode === "edit"
                ? () => updateCommitteeMember(dialog.seat.id, toFormData(draft))
                : () => addCommitteeMember(toFormData(draft, teamMemberId!));
            setBusyId(null);
            startTransition(async () => {
              const result = await action();
              if ("error" in result) {
                toast.error(result.error);
                return;
              }
              toast.success(
                dialog.mode === "edit" ? "Committee seat updated." : "Added to the committee.",
              );
              setDialog(null);
              router.refresh();
            });
          }}
        />
      )}

      <ConfirmDialog
        open={confirmRemove !== null}
        tone="danger"
        title={`Remove ${personLabel(confirmRemove?.person ?? null)} from the committee?`}
        description="They stay in the team directory: this removes the committee seat only. Their profile, portrait and public staff page are untouched."
        confirmLabel="Remove from committee"
        busyLabel="Removing…"
        busy={isPending}
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => {
          const seat = confirmRemove;
          setConfirmRemove(null);
          if (!seat) return;
          run(seat.id, () => removeCommitteeMember(seat.id), "Removed from the committee.");
        }}
      />
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────

function SectionPanel({
  title,
  meta,
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-divider bg-bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <h2 className="min-w-0">{title}</h2>
        <div className="flex shrink-0 flex-wrap items-center gap-2">{meta}</div>
      </header>
      <div className="divide-y divide-divider border-t border-divider">{children}</div>
    </section>
  );
}

function CommitteeMemberAvatar({
  photoUrl,
  photoAlt,
  name,
  size = 48,
}: {
  photoUrl: string | null;
  photoAlt?: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  if (photoUrl && !failed) {
    return (
      <Image
        src={photoUrl}
        alt={photoAlt ?? name}
        width={size}
        height={size}
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-blue-950">
      <span className="select-none text-base font-bold text-white" aria-hidden="true">
        {(name || "?").trim().charAt(0).toUpperCase()}
      </span>
    </div>
  );
}

function SeatRow({
  seat,
  index,
  total,
  canManage,
  busy,
  isPending,
  onEdit,
  onRemove,
  onTogglePublish,
  onReorder,
}: {
  seat: CommitteeMemberRow;
  index: number;
  total: number;
  canManage: boolean;
  busy: boolean;
  isPending: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onTogglePublish: (next: boolean) => void;
  onReorder: (direction: "up" | "down") => void;
}) {
  const person = seat.person;
  const name = personLabel(person);
  const role = seat.role_en || seat.role_km || person?.position_en || person?.position_km;

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5 transition sm:flex-nowrap ${
        busy ? "pointer-events-none opacity-40" : ""
      } ${seat.is_published ? "" : "opacity-70"}`}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
        <CommitteeMemberAvatar
          photoUrl={person?.photo_url ?? null}
          photoAlt={person?.photo_alt ?? name}
          name={name}
          size={48}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold text-text-heading">{name}</p>
          {person?.name_km && (
            <span className="font-kh text-sm text-text-muted" lang="km">
              {person.name_km}
            </span>
          )}
          {!seat.is_published && (
            <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yellow-700">
              Draft
            </span>
          )}
          {person && !person.is_published && (
            <span
              className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-text-muted"
              title="This person is not published on /about/team, so the committee page will not link to their profile."
            >
              No staff profile
            </span>
          )}
          {!person && (
            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-600">
              Team member missing
            </span>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-text-muted">
          {role ?? "No committee role set"}
        </p>
      </div>

      {canManage && (
        <div className="flex shrink-0 flex-col gap-0.5">
          <button
            type="button"
            onClick={() => onReorder("up")}
            disabled={isPending || index === 0}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${name} up`}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onReorder("down")}
            disabled={isPending || index === total - 1}
            className="cursor-pointer rounded p-1 text-text-muted transition hover:bg-paper hover:text-text-body disabled:cursor-not-allowed disabled:opacity-25"
            aria-label={`Move ${name} down`}
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* The publish state is information either way: a read-only viewer sees
          the badge, an editor sees the switch. */}
      {canManage ? (
        <button
          type="button"
          role="switch"
          aria-checked={seat.is_published}
          aria-label={
            seat.is_published
              ? `Unpublish ${name} from the committee page`
              : `Publish ${name} on the committee page`
          }
          onClick={() => onTogglePublish(!seat.is_published)}
          disabled={isPending}
          className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors disabled:cursor-not-allowed ${
            seat.is_published ? "bg-emerald-500" : "bg-divider"
          }`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
              seat.is_published ? "left-[18px]" : "left-0.5"
            }`}
          />
        </button>
      ) : (
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            seat.is_published ? "bg-emerald-50 text-emerald-700" : "bg-paper text-text-muted"
          }`}
        >
          {seat.is_published ? "Published" : "Draft"}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-2">
        {person && (
          <Link
            href={`/admin/team/${person.id}/edit`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Profile
          </Link>
        )}
        {canManage && (
          <>
            <button
              type="button"
              onClick={onEdit}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-3 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit seat
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={isPending}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
            >
              <UserMinus className="h-3.5 w-3.5" aria-hidden="true" />
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Add or edit one seat.
 *
 * In `add` mode the first step is finding the PERSON, never describing one:
 * the search lists team members who are not yet seated, and the only escape
 * from an empty result is the existing team form.
 */
function SeatDialog({
  mode,
  seat,
  sections,
  candidates,
  busy,
  onClose,
  onSubmit,
}: {
  mode: "add" | "edit";
  seat: CommitteeMemberRow | null;
  sections: CommitteeSectionRow[];
  candidates: CommitteeCandidate[];
  busy: boolean;
  onClose: () => void;
  onSubmit: (draft: SeatDraft, teamMemberId: string | null) => void;
}) {
  const baseId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [personId, setPersonId] = useState<string | null>(seat?.team_member_id ?? null);
  const [draft, setDraft] = useState<SeatDraft>(seat ? draftFrom(seat) : EMPTY_DRAFT);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLElement>("input, select, textarea, button")
        ?.focus();
    }, 0);
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
    // `busy` is read inside the handler; re-binding on every change of it would
    // drop a keypress mid-save for no benefit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates.slice(0, 8);
    return candidates
      .filter((c) =>
        [c.name_en, c.name_km, c.position_en, c.position_km].some((v) =>
          v?.toLowerCase().includes(q),
        ),
      )
      .slice(0, 8);
  }, [candidates, query]);

  const selected =
    mode === "edit"
      ? null
      : (candidates.find((c) => c.id === personId) ?? null);
  const canSubmit = mode === "edit" || Boolean(personId);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${baseId}-title`}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-divider bg-bg-surface p-6 shadow-xl sm:rounded-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id={`${baseId}-title`} className="text-lg font-bold text-text-heading">
              {mode === "add" ? "Add committee member" : "Edit committee seat"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {mode === "add"
                ? "Choose someone who is already in the team directory."
                : `Committee details for ${personLabel(seat?.person ?? null)}. Their name, portrait and biography live on their team record.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="cursor-pointer rounded-lg p-1.5 text-text-muted transition hover:bg-paper hover:text-text-body"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSubmit) return;
            onSubmit(draft, personId);
          }}
          className="space-y-5"
        >
          {mode === "add" && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-semibold text-text-heading">Team member</legend>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search by name or position…"
                  aria-label="Search team members"
                  className="focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface pl-9 pr-3 text-base"
                />
              </div>

              {matches.length === 0 ? (
                <p className="rounded-lg border border-dashed border-divider px-4 py-5 text-center text-sm text-text-muted">
                  No matching team member.{" "}
                  <Link href="/admin/team/new" className="font-semibold text-brand underline">
                    Create a new team member
                  </Link>{" "}
                  first — the committee never creates a second profile.
                </p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Team members">
                  {matches.map((candidate) => {
                    const chosen = candidate.id === personId;
                    return (
                      /* role="none" on the item: a <li> between a radiogroup and
                         its radios breaks the required ownership relation. */
                      <li key={candidate.id} role="none">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={chosen}
                          onClick={() => setPersonId(candidate.id)}
                          className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition ${
                            chosen
                              ? "border-blue-950 bg-blue-50"
                              : "border-divider hover:bg-paper"
                          }`}
                        >
                          <span className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-divider bg-paper">
                            <CommitteeMemberAvatar
                              photoUrl={candidate.photo_url}
                              photoAlt={candidate.name_en}
                              name={candidate.name_en}
                              size={36}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-text-heading">
                              {candidate.name_en}
                              <span className="font-kh ml-2 font-normal text-text-muted" lang="km">
                                {candidate.name_km}
                              </span>
                            </span>
                            <span className="block truncate text-xs text-text-muted">
                              {candidate.position_en || candidate.position_km || "No position set"}
                              {!candidate.is_published && " · not published on /about/team"}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {selected && (
                <p className="text-xs text-text-muted">
                  Selected: <strong>{selected.name_en}</strong>
                </p>
              )}
            </fieldset>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${baseId}-section`}
              label="Committee section"
              hint="Groups this person on the public page."
            >
              <select
                id={`${baseId}-section`}
                value={draft.committee_section_id}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, committee_section_id: event.target.value }))
                }
                className="focus-field h-11 w-full cursor-pointer rounded-lg border border-divider bg-bg-surface px-3 text-base"
              >
                <option value="">No section</option>
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name_en}
                    {section.is_active ? "" : " (hidden)"}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              id={`${baseId}-order`}
              label="Display order"
              hint="Lower numbers appear first within the section."
            >
              <input
                id={`${baseId}-order`}
                type="number"
                min={0}
                value={draft.display_order}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, display_order: event.target.value }))
                }
                className="focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-base"
              />
            </Field>

            <Field id={`${baseId}-role-km`} label="Committee role (Khmer)">
              <input
                id={`${baseId}-role-km`}
                type="text"
                lang="km"
                value={draft.role_km}
                onChange={(event) => setDraft((prev) => ({ ...prev, role_km: event.target.value }))}
                className="focus-field font-kh h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-base"
              />
            </Field>

            <Field id={`${baseId}-role-en`} label="Committee role (English)">
              <input
                id={`${baseId}-role-en`}
                type="text"
                value={draft.role_en}
                onChange={(event) => setDraft((prev) => ({ ...prev, role_en: event.target.value }))}
                className="focus-field h-11 w-full rounded-lg border border-divider bg-bg-surface px-3 text-base"
              />
            </Field>

            <Field id={`${baseId}-resp-km`} label="Responsibility (Khmer)">
              <textarea
                id={`${baseId}-resp-km`}
                lang="km"
                rows={3}
                value={draft.responsibility_km}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, responsibility_km: event.target.value }))
                }
                className="focus-field font-kh w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-base"
              />
            </Field>

            <Field id={`${baseId}-resp-en`} label="Responsibility (English)">
              <textarea
                id={`${baseId}-resp-en`}
                rows={3}
                value={draft.responsibility_en}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, responsibility_en: event.target.value }))
                }
                className="focus-field w-full rounded-lg border border-divider bg-bg-surface px-3 py-2 text-base"
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-divider bg-paper px-4 py-3">
            <input
              type="checkbox"
              checked={draft.is_published}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, is_published: event.target.checked }))
              }
              className="mt-0.5 h-4 w-4 cursor-pointer accent-blue-800"
            />
            <span className="text-sm">
              <span className="font-semibold text-text-heading">
                Show on the public committee page
              </span>
              <span className="mt-0.5 block text-xs text-text-muted">
                Separate from their staff profile: publishing a seat does not publish the person on
                /about/team, and unpublishing it does not hide them there.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-2 border-t border-divider pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-divider px-4 text-sm font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy || !canSubmit}
              className="inline-flex min-h-11 cursor-pointer items-center rounded-lg bg-blue-950 px-5 text-sm font-semibold text-white transition hover:bg-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Saving…" : mode === "add" ? "Add to committee" : "Save seat"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold text-text-heading">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
    </div>
  );
}
