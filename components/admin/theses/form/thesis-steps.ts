import { FileText, GraduationCap, Users, AlignLeft, BookOpen, Paperclip, ClipboardCheck, type LucideIcon } from "lucide-react";

export type ThesisStepKey = "basic" | "classification" | "people" | "abstract" | "references" | "files" | "review";

/** How a step's badge should read. See STEP_STATE_NOTE below. */
export type ThesisStepState = "complete" | "attention" | "todo" | "optional";

export const THESIS_STEPS: { key: ThesisStepKey; label: string; icon: LucideIcon }[] = [
  { key: "basic", label: "Basic Info", icon: FileText },
  { key: "classification", label: "Classification", icon: GraduationCap },
  { key: "people", label: "People", icon: Users },
  { key: "abstract", label: "Abstract", icon: AlignLeft },
  { key: "references", label: "References", icon: BookOpen },
  { key: "files", label: "Files", icon: Paperclip },
  { key: "review", label: "Review", icon: ClipboardCheck },
];

/**
 * STEP_STATE_NOTE — the four states a step badge can report, rendered by the
 * shared `FormTabs` (components/admin/kit/form).
 *
 *   complete   filled in, nothing outstanding
 *   attention  required, incomplete, and publishing is blocked on it
 *   todo       required and still empty, but nothing is blocked yet
 *   optional   optional and empty — deliberately quiet
 *
 * `todo` is the state that keeps a fresh form calm. The distinction is not
 * cosmetic: red is a claim that something is wrong, and on an untouched draft
 * nothing is — a draft has only ever needed a title. It turns red when the
 * author asks to publish, which is when the rule actually applies.
 *
 * This file used to also export a left-rail nav component. The rail is gone
 * (top tabs now), so what remains is the step registry and its vocabulary —
 * ThesisForm maps `attention` onto FormTabs' `error`.
 */
