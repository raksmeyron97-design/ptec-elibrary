"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Users, Loader2, X } from "lucide-react";
import { AUDIENCE_TYPES, TARGETABLE_ROLES } from "@/lib/admin/announcements/shared";
import type { AnnouncementInput, FieldErrors } from "@/lib/admin/announcements/validation";
import { searchUsersForAudience } from "@/app/(admin)/admin/(protected)/announcements/actions";
import type { AudienceEstimate } from "./AnnouncementComposer";

export default function StepAudience({
  value,
  onChange,
  errors,
  estimate,
  estimating,
}: {
  value: AnnouncementInput;
  onChange: (patch: Partial<AnnouncementInput>) => void;
  errors: FieldErrors;
  estimate: AudienceEstimate | null;
  estimating: boolean;
}) {
  const t = useTranslations("adminAnnouncements.composer.audience");
  const audience = value.audience;

  function setType(ty: string) {
    onChange({ audience: { ...audience, type: ty as AnnouncementInput["audience"]["type"] } });
  }
  function toggleRole(role: string) {
    const roles = audience.roles.includes(role) ? audience.roles.filter((r) => r !== role) : [...audience.roles, role];
    onChange({ audience: { ...audience, roles } });
  }

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-bold text-text-heading">{t("legend")}</legend>
        {AUDIENCE_TYPES.map((ty) => (
          <label key={ty} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${audience.type === ty ? "border-brand/40 bg-brand/5" : "border-divider bg-bg-surface"}`}>
            <input type="radio" name="audience-type" checked={audience.type === ty} onChange={() => setType(ty)} className="mt-0.5 h-4 w-4 text-brand focus:ring-focus-ring/30" />
            <span>
              <span className="block text-sm font-semibold text-text-heading">{t(`type.${ty}`)}</span>
              <span className="block text-xs text-text-muted">{t(`typeDescription.${ty}`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {audience.type === "role" && (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold text-text-muted">{t("selectRoles")}</legend>
          <div className="flex flex-wrap gap-2">
            {TARGETABLE_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                aria-pressed={audience.roles.includes(role)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${audience.roles.includes(role) ? "border-brand bg-brand text-white" : "border-divider bg-bg-surface text-text-body hover:bg-paper"}`}
              >
                {role}
              </button>
            ))}
          </div>
          {errors["audience.roles"] && <p className="mt-1.5 text-xs font-medium text-danger">{errors["audience.roles"]}</p>}
        </fieldset>
      )}

      {audience.type === "individual" && (
        <IndividualPicker value={value} onChange={onChange} errors={errors} />
      )}

      <div className="rounded-xl border border-divider bg-paper p-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand" aria-hidden="true" />
          <span className="text-sm font-semibold text-text-heading">{t("estimateHeading")}</span>
        </div>
        {estimating ? (
          <p className="mt-2 flex items-center gap-1.5 text-sm text-text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t("estimating")}</p>
        ) : estimate ? (
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span><span className="font-bold text-text-heading">{estimate.recipientCount}</span> <span className="text-text-muted">{t("estimatedUsers")}</span></span>
            {value.channels.push && (
              <span><span className="font-bold text-text-heading">{estimate.deviceCount}</span> <span className="text-text-muted">{t("estimatedDevices")}</span></span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-text-muted">{t("noEstimateYet")}</p>
        )}
        <p className="mt-2 text-xs text-text-muted">{t("estimateDisclaimer")}</p>
      </div>
    </div>
  );
}

function IndividualPicker({
  value,
  onChange,
  errors,
}: {
  value: AnnouncementInput;
  onChange: (patch: Partial<AnnouncementInput>) => void;
  errors: FieldErrors;
}) {
  const t = useTranslations("adminAnnouncements.composer.audience");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [selectedMeta, setSelectedMeta] = useState<Record<string, string>>({});
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing stale results when the query is emptied, not a render-derivable value
    if (!query.trim()) { setResults([]); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await searchUsersForAudience(query);
        setResults(res);
        setSelectedMeta((prev) => ({ ...prev, ...Object.fromEntries(res.map((r) => [r.id, r.name])) }));
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  function addUser(id: string) {
    if (value.audience.userIds.includes(id)) return;
    onChange({ audience: { ...value.audience, userIds: [...value.audience.userIds, id] } });
  }
  function removeUser(id: string) {
    onChange({ audience: { ...value.audience, userIds: value.audience.userIds.filter((u) => u !== id) } });
  }

  return (
    <fieldset>
      <legend className="mb-2 text-xs font-semibold text-text-muted">{t("selectUsers")}</legend>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchUsersPlaceholder")}
        className="h-10 w-full rounded-lg border border-divider bg-bg-surface px-3 text-sm text-text-body focus:outline-none focus:ring-2 focus:ring-brand/30"
      />
      {searching && <p className="mt-1 text-xs text-text-muted">{t("searching")}</p>}
      {results.length > 0 && (
        <ul className="mt-1.5 max-h-40 overflow-y-auto rounded-lg border border-divider bg-bg-surface">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => addUser(r.id)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-paper">
                <span>{r.name}</span>
                {r.email && <span className="text-xs text-text-muted">{r.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {value.audience.userIds.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.audience.userIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand">
              {selectedMeta[id] ?? id}
              <button type="button" onClick={() => removeUser(id)} aria-label={t("removeUser", { name: selectedMeta[id] ?? id })}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      {errors["audience.userIds"] && <p className="mt-1.5 text-xs font-medium text-danger">{errors["audience.userIds"]}</p>}
    </fieldset>
  );
}
