"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useToast } from "@/components/admin/kit";
import ComposerStepNav, { COMPOSER_STEPS, type ComposerStepKey } from "./ComposerStepNav";
import StepContent from "./StepContent";
import StepChannels from "./StepChannels";
import StepAudience from "./StepAudience";
import StepSchedule from "./StepSchedule";
import StepReview from "./StepReview";
import {
  validateContentStep,
  validateChannelsStep,
  validateAudienceStep,
  validateScheduleStep,
  type AnnouncementInput,
} from "@/lib/admin/announcements/validation";
import {
  createDraftAnnouncement,
  updateAnnouncement,
  publishAnnouncement,
  estimateAudienceAction,
} from "@/app/(admin)/admin/(protected)/announcements/actions";

export type AudienceEstimate = { recipientCount: number; deviceCount: number };

export const EMPTY_INPUT: AnnouncementInput = {
  internalName: "",
  type: "general",
  priority: "normal",
  imageUrl: null,
  content: {
    en: { title: "", summary: "", body: "", ctaLabel: "" },
    km: { title: "", summary: "", body: "", ctaLabel: "" },
  },
  ctaUrl: null,
  channels: { inApp: true, banner: false, push: false },
  push: { title: "", body: "", url: "", ttlSeconds: null },
  audience: { type: "all_active", roles: [], userIds: [] },
  pinned: false,
  dismissible: true,
  schedule: { mode: "now", scheduledAt: null, expiresAt: null },
};

export default function AnnouncementComposer({
  mode,
  announcementId,
  initial,
  initialStep,
  canPush,
}: {
  mode: "create" | "edit";
  announcementId?: string;
  initial: AnnouncementInput;
  initialStep?: ComposerStepKey;
  canPush: boolean;
}) {
  const t = useTranslations("adminAnnouncements.composer");
  const router = useRouter();
  const toast = useToast();

  const [value, setValue] = useState<AnnouncementInput>(initial);
  const [step, setStep] = useState<ComposerStepKey>(initialStep ?? "content");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState<"draft" | "schedule" | "publish" | null>(null);
  const [currentId, setCurrentId] = useState<string | undefined>(announcementId);

  const [estimate, setEstimate] = useState<AudienceEstimate | null>(null);
  const [estimating, setEstimating] = useState(false);
  const estimateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onChange(patch: Partial<AnnouncementInput>) {
    setValue((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    function handler(e: BeforeUnloadEvent) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Debounced server-side audience estimate — recomputed whenever the
  // audience rule (or push channel toggle, which changes device relevance)
  // changes. This is a PREVIEW ONLY; publish always recalculates for real.
  useEffect(() => {
    // Flip the loading flag for the debounced async fetch below — subscribing
    // to an external system (the server estimate), not deriving from props.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEstimating(true);
    if (estimateDebounce.current) clearTimeout(estimateDebounce.current);
    estimateDebounce.current = setTimeout(async () => {
      try {
        const res = await estimateAudienceAction({ type: value.audience.type, roles: value.audience.roles, userIds: value.audience.userIds });
        setEstimate(res);
      } catch {
        setEstimate(null);
      } finally {
        setEstimating(false);
      }
    }, 400);
    return () => { if (estimateDebounce.current) clearTimeout(estimateDebounce.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.audience.type, JSON.stringify(value.audience.roles), JSON.stringify(value.audience.userIds)]);

  const errorsByStep = useMemo(() => ({
    content: validateContentStep(value),
    channels: validateChannelsStep(value),
    audience: validateAudienceStep(value),
    schedule: validateScheduleStep(value),
    review: {},
  }), [value]);

  const errorCounts = Object.fromEntries(
    (Object.keys(errorsByStep) as ComposerStepKey[]).map((k) => [k, Object.keys(errorsByStep[k]).length]),
  ) as Partial<Record<ComposerStepKey, number>>;

  const completed = new Set<ComposerStepKey>(
    (Object.keys(errorsByStep) as ComposerStepKey[]).filter((k) => k !== "review" && Object.keys(errorsByStep[k]).length === 0),
  );

  async function persist(): Promise<string> {
    if (currentId) {
      await updateAnnouncement(currentId, value);
      return currentId;
    }
    const { id } = await createDraftAnnouncement(value);
    setCurrentId(id);
    return id;
  }

  async function handleSaveDraft() {
    setSaving("draft");
    try {
      const id = await persist();
      setDirty(false);
      toast.success(t("toasts.draftSaved"));
      if (mode === "create") router.push(`/admin/announcements/${id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.saveFailed"));
    } finally {
      setSaving(null);
    }
  }

  async function handleSchedule() {
    setSaving("schedule");
    try {
      const id = await persist();
      await publishAnnouncement(id, { mode: "schedule", scheduledAt: value.schedule.scheduledAt });
      setDirty(false);
      toast.success(t("toasts.scheduled"));
      router.push(`/admin/announcements/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.scheduleFailed"));
    } finally {
      setSaving(null);
    }
  }

  async function handlePublishNow() {
    setSaving("publish");
    try {
      const id = await persist();
      const result = await publishAnnouncement(id, { mode: "now" });
      setDirty(false);
      toast.success(
        result.status === "active"
          ? t("toasts.published")
          : t("toasts.publishing", { devices: result.estimatedDevices }),
      );
      router.push(`/admin/announcements/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("toasts.publishFailed"));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm">
      <div className="flex flex-col md:flex-row">
        <ComposerStepNav active={step} completed={completed} errorCounts={errorCounts} onSelect={setStep} />

        <div className="min-w-0 flex-1 p-5 sm:p-6">
          {COMPOSER_STEPS.map((s) => (
            <div key={s.key} id={`composer-panel-${s.key}`} role="tabpanel" hidden={step !== s.key}>
              {step === s.key && (
                <>
                  {s.key === "content" && <StepContent value={value} onChange={onChange} errors={errorsByStep.content} />}
                  {s.key === "channels" && <StepChannels value={value} onChange={onChange} errors={errorsByStep.channels} canPush={canPush} />}
                  {s.key === "audience" && <StepAudience value={value} onChange={onChange} errors={errorsByStep.audience} estimate={estimate} estimating={estimating} />}
                  {s.key === "schedule" && <StepSchedule value={value} onChange={onChange} errors={errorsByStep.schedule} />}
                  {s.key === "review" && (
                    <StepReview
                      value={value}
                      estimate={estimate}
                      estimating={estimating}
                      canPush={canPush}
                      saving={saving}
                      onSaveDraft={handleSaveDraft}
                      onSchedule={handleSchedule}
                      onPublishNow={handlePublishNow}
                    />
                  )}
                </>
              )}
            </div>
          ))}

          {step !== "review" && (
            <div className="mt-6 flex items-center justify-between border-t border-divider pt-4">
              <button type="button" onClick={handleSaveDraft} disabled={saving !== null} className="text-sm font-semibold text-text-muted transition hover:text-brand disabled:opacity-60">
                {saving === "draft" ? t("saving") : t("saveDraftShort")}
              </button>
              <div className="flex items-center gap-2">
                {COMPOSER_STEPS.findIndex((s) => s.key === step) > 0 && (
                  <button
                    type="button"
                    onClick={() => setStep(COMPOSER_STEPS[COMPOSER_STEPS.findIndex((s) => s.key === step) - 1].key)}
                    className="rounded-xl border border-divider bg-bg-surface px-4 py-2 text-sm font-semibold text-text-body transition hover:bg-paper"
                  >
                    {t("back")}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setStep(COMPOSER_STEPS[COMPOSER_STEPS.findIndex((s) => s.key === step) + 1].key)}
                  className="rounded-xl bg-brand px-5 py-2 text-sm font-bold text-white transition hover:bg-brand-hover"
                >
                  {t("next")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
