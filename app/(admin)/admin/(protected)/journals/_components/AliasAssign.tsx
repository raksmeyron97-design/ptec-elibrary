"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { addJournalAlias } from "@/app/actions/journals";
import { useToast } from "@/components/admin/kit";
import { BTN_SECONDARY, ButtonBusy, INPUT_CLASS } from "@/components/admin/kit/form";

/**
 * "Add as another name of …" for one unmatched journal name. The alias goes
 * through addJournalAlias, which re-runs 0148's own mapping rule — nothing
 * here decides which articles move.
 */
export default function AliasAssign({ name, journals }: { name: string; journals: { id: string; title: string }[] }) {
  const t = useTranslations("adminJournals");
  const toast = useToast();
  const router = useRouter();
  const selectId = `alias${useId().replace(/:/g, "")}`;
  const [journalId, setJournalId] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!journalId) return;
    setBusy(true);
    const res = await addJournalAlias(journalId, name);
    setBusy(false);
    if (!res.ok) return toast.error(t(res.error));
    toast.success(t("aliasAdded", { count: res.data.mapped }));
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={selectId} className="text-xs font-medium text-text-muted">
        {t("addAsAliasOf")}
      </label>
      <select
        id={selectId}
        className={`${INPUT_CLASS} h-9 w-auto max-w-[260px]`}
        value={journalId}
        disabled={busy}
        onChange={(e) => setJournalId(e.target.value)}
      >
        <option value="">{t("chooseJournal")}</option>
        {journals.map((j) => (
          <option key={j.id} value={j.id}>
            {j.title}
          </option>
        ))}
      </select>
      <button type="button" className={BTN_SECONDARY} disabled={!journalId || busy} onClick={add}>
        {busy ? <ButtonBusy label={t("saving")} /> : t("addAlias")}
      </button>
    </div>
  );
}
