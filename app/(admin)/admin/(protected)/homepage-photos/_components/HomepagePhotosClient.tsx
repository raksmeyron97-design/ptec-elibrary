"use client";

/**
 * The sortable homepage-photo grid.
 *
 * Reordering is native HTML5 drag-and-drop plus a pair of move buttons. No
 * drag library: @dnd-kit is not a dependency of this project, and a mouse-only
 * reorder would fail the keyboard requirement anyway — the buttons are the
 * accessible path, and the drag is the convenience on top of it.
 *
 * Order is saved on drop (optimistically), not behind a "save" button: the
 * grid IS the homepage order, so leaving the page mid-edit should not silently
 * discard it. A failed save reverts the list and says so.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Image from "next/image";
import {
  ArrowDown, ArrowUp, Eye, EyeOff, GripVertical, ImagePlus, Images,
  Loader2, Pencil, Trash2,
} from "lucide-react";
import { useCan } from "@/components/admin/access/AdminCapabilities";
import { Badge, ConfirmDialog, EmptyState, useToast } from "@/components/admin/kit";
import type { BadgeTone } from "@/components/admin/kit";
import {
  deletePhoto, togglePhotoActive, updatePhotoMetadata, updatePhotoOrder, uploadPhoto,
} from "@/app/actions/homepage-photos";
import type { HomepagePhoto, PhotoCategory } from "@/lib/types/homepage-photo";
import PhotoFormModal, { type PhotoFormValues } from "./PhotoFormModal";

/** How the public homepage consumes the ordered list. Surfaced per card so an
 *  editor can see which drag actually changes the hero. Mirrors the slicing in
 *  components/ui/home/HeroPhotoGallery.tsx + NarrativeCards.tsx. */
const HERO_SLOTS = 3;
const NARRATIVE_SLOTS = 3;

const CATEGORY_TONE: Record<PhotoCategory, BadgeTone> = {
  general: "neutral",
  "ptec-library": "success",
  "o-bek-kaom": "info",
  events: "brand",
};

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function HomepagePhotosClient({ photos }: { photos: HomepagePhoto[] }) {
  const t = useTranslations("adminHomepagePhotos");
  const toast = useToast();
  const router = useRouter();
  /* `homepage_photos: read` sees the gallery as it will appear — order,
     captions, which three reach the hero. Every control that changes it (add,
     reorder, show/hide, edit, delete) is one `write` capability, re-checked by
     each action in app/actions/homepage-photos.ts. Reordering is drag-and-drop
     as well as buttons, so the drag handlers are gated too — hiding the arrows
     while leaving the row draggable would be a control that only *looks* gone. */
  const canManage = useCan("homepagePhotos.manage");

  const [list, setList] = useState(photos);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [modal, setModal] = useState<{ mode: "create" } | { mode: "edit"; photo: HomepagePhoto } | null>(null);
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<HomepagePhoto | null>(null);
  const [, startTransition] = useTransition();

  // Re-sync when the server component re-renders after a router.refresh().
  const [prevPhotos, setPrevPhotos] = useState(photos);
  if (prevPhotos !== photos) {
    setPrevPhotos(photos);
    setList(photos);
  }

  /** Optimistic reorder: paint the new order, then persist it. */
  function commitOrder(next: HomepagePhoto[]) {
    const previous = list;
    setList(next);
    setSavingOrder(true);
    startTransition(async () => {
      const result = await updatePhotoOrder(next.map((p) => p.id));
      setSavingOrder(false);
      if ("error" in result) {
        setList(previous);
        toast.error(result.error);
      } else {
        toast.success(t("orderUpdated"));
      }
    });
  }

  function moveBy(index: number, delta: number) {
    const next = move(list, index, index + delta);
    if (next !== list) commitOrder(next);
  }

  function onDrop(index: number) {
    if (dragIndex === null) return;
    const next = move(list, dragIndex, index);
    setDragIndex(null);
    setOverIndex(null);
    if (next !== list) commitOrder(next);
  }

  function toggle(photo: HomepagePhoto) {
    setBusyId(photo.id);
    startTransition(async () => {
      const result = await togglePhotoActive(photo.id, !photo.is_active);
      setBusyId(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setList((current) =>
        current.map((p) => (p.id === photo.id ? { ...p, is_active: !p.is_active } : p)),
      );
      toast.success(photo.is_active ? t("nowHidden") : t("nowVisible"));
    });
  }

  function submitModal(values: PhotoFormValues) {
    if (!modal) return;
    setModalBusy(true);
    setModalError(null);

    const payload = new FormData();
    payload.set("caption_km", values.caption_km);
    payload.set("caption_en", values.caption_en);
    payload.set("alt_text_km", values.alt_text_km);
    payload.set("alt_text_en", values.alt_text_en);
    payload.set("category", values.category);
    if (values.file) payload.set("file", values.file);

    startTransition(async () => {
      const result =
        modal.mode === "edit"
          ? await updatePhotoMetadata(modal.photo.id, payload)
          : await uploadPhoto(payload);
      setModalBusy(false);
      if ("error" in result) {
        setModalError(result.error);
        return;
      }
      setModal(null);
      toast.success(modal.mode === "edit" ? t("changesSaved") : t("uploadSuccess"));
      // The server component owns the list; refetch rather than guessing the
      // row the database just generated (id, order, derived dimensions).
      router.refresh();
    });
  }

  function remove() {
    const photo = confirmDelete;
    if (!photo) return;
    setBusyId(photo.id);
    startTransition(async () => {
      const result = await deletePhoto(photo.id);
      setBusyId(null);
      setConfirmDelete(null);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setList((current) => current.filter((p) => p.id !== photo.id));
      toast.success(t("deleted"));
    });
  }

  const activeCount = list.filter((p) => p.is_active).length;

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-muted" aria-live="polite">
          {savingOrder ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              {t("savingOrder")}
            </span>
          ) : (
            t("countSummary", { total: list.length, active: activeCount })
          )}
        </p>
        {canManage && (
          <button
            type="button"
            onClick={() => { setModalError(null); setModal({ mode: "create" }); }}
            className="focus-field inline-flex cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition hover:bg-brand-hover"
          >
            <ImagePlus className="h-4 w-4" aria-hidden />
            {t("addPhoto")}
          </button>
        )}
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<Images className="h-6 w-6" />}
          title={t("emptyTitle")}
          description={t("emptyBody")}
        />
      ) : (
        <>
          {/* The hint describes an interaction a read-only viewer does not have. */}
          {canManage && <p className="text-xs text-text-muted">{t("dragToReorder")}</p>}
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((photo, index) => {
              const slot =
                index < HERO_SLOTS
                  ? t("slotHero", { n: index + 1 })
                  : index < HERO_SLOTS + NARRATIVE_SLOTS
                    ? t("slotNarrative", { n: index - HERO_SLOTS + 1 })
                    : t("slotUnused");
              const isBusy = busyId === photo.id;

              return (
                <li
                  key={photo.id}
                  draggable={canManage}
                  onDragStart={canManage ? () => setDragIndex(index) : undefined}
                  onDragEnd={canManage ? () => { setDragIndex(null); setOverIndex(null); } : undefined}
                  onDragOver={canManage ? (e) => { e.preventDefault(); setOverIndex(index); } : undefined}
                  onDrop={canManage ? (e) => { e.preventDefault(); onDrop(index); } : undefined}
                  className={`rounded-xl border bg-bg-surface shadow-sm transition ${
                    overIndex === index && dragIndex !== null && dragIndex !== index
                      ? "border-brand ring-2 ring-brand/30"
                      : "border-divider hover:shadow-md"
                  } ${dragIndex === index ? "opacity-50" : ""} ${isBusy ? "opacity-60" : ""}`}
                >
                  {/* Thumbnail */}
                  <div className="relative aspect-[16/10] overflow-hidden rounded-t-xl bg-paper">
                    <Image
                      src={photo.public_url}
                      alt={photo.alt_text_en || photo.alt_text_km || ""}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className={`object-cover ${photo.is_active ? "" : "grayscale"}`}
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {slot}
                    </span>
                    {!photo.is_active && (
                      <span className="absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-white">
                        {t("inactive")}
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 p-4">
                    <div className="flex items-start gap-2">
                      {canManage && (
                        <span
                          className="mt-0.5 shrink-0 cursor-grab text-text-muted"
                          aria-hidden
                          title={t("dragHandle")}
                        >
                          <GripVertical className="h-4 w-4" />
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text-heading">
                          {photo.caption_en || photo.caption_km || t("noCaption")}
                        </p>
                        {photo.caption_km && photo.caption_en && (
                          <p className="truncate text-xs text-text-muted">{photo.caption_km}</p>
                        )}
                      </div>
                      <Badge tone={CATEGORY_TONE[photo.category]}>
                        {t(`categories.${photo.category}`)}
                      </Badge>
                    </div>

                    {canManage && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => moveBy(index, -1)}
                        disabled={index === 0 || savingOrder}
                        aria-label={t("moveUp")}
                        className="focus-field cursor-pointer rounded-lg border border-divider p-1.5 text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveBy(index, 1)}
                        disabled={index === list.length - 1 || savingOrder}
                        aria-label={t("moveDown")}
                        className="focus-field cursor-pointer rounded-lg border border-divider p-1.5 text-text-body transition hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                      </button>

                      <button
                        type="button"
                        onClick={() => toggle(photo)}
                        disabled={isBusy}
                        aria-pressed={photo.is_active}
                        className="focus-field ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-divider px-2.5 py-1.5 text-xs font-semibold text-text-body transition hover:bg-paper disabled:opacity-50"
                      >
                        {photo.is_active ? <Eye className="h-3.5 w-3.5" aria-hidden /> : <EyeOff className="h-3.5 w-3.5" aria-hidden />}
                        {photo.is_active ? t("active") : t("inactive")}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setModalError(null); setModal({ mode: "edit", photo }); }}
                        aria-label={t("editPhoto")}
                        className="focus-field cursor-pointer rounded-lg border border-divider p-1.5 text-text-body transition hover:bg-paper"
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(photo)}
                        disabled={isBusy}
                        aria-label={t("deletePhoto")}
                        className="focus-field cursor-pointer rounded-lg border border-danger-line p-1.5 text-danger transition hover:bg-danger-soft disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <PhotoFormModal
        // Remount per target so the form state cannot leak from one photo
        // (or from a cancelled upload) into the next.
        key={modal === null ? "closed" : modal.mode === "edit" ? modal.photo.id : "create"}
        open={modal !== null}
        photo={modal?.mode === "edit" ? modal.photo : null}
        busy={modalBusy}
        error={modalError}
        onCancel={() => setModal(null)}
        onSubmit={submitModal}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t("deleteTitle")}
        description={t("deleteConfirm")}
        hint={t("deleteHint")}
        confirmLabel={t("deletePhoto")}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={remove}
        busy={busyId !== null && confirmDelete?.id === busyId}
      />
    </div>
  );
}
