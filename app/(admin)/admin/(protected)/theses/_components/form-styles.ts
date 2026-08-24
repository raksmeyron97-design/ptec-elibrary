/**
 * Shared field-styling tokens, originally written for the thesis Create/Edit
 * forms and also used by the Publications and Learning Path admin forms.
 *
 * The values now live in `components/admin/kit/form/styles.ts` alongside the
 * `Field` component that consumes them; this module re-exports them so the
 * existing importers keep working unchanged. Prefer importing from
 * `@/components/admin/kit/form` in new code.
 */

export { INPUT_CLASS, LABEL_CLASS } from "@/components/admin/kit/form/styles";
