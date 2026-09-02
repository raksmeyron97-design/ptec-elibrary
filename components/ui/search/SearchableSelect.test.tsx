import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import SearchableSelect from "./SearchableSelect";

/**
 * The contract: taking a `name` means participating in form submission.
 *
 * This component rendered its hidden input for uncontrolled callers only, so a
 * controlled caller got a widget that displayed a selection, reported it to
 * `onChange`, and put NOTHING into `new FormData(form)`. The book upload form
 * made both its taxonomy selects controlled (commit 2f47a1d) while still
 * reading them out of `formData` — the department was visibly chosen, the
 * readiness panel agreed, and the server answered "department is required"
 * after the PDF and the cover had already been uploaded to storage.
 *
 * A component test rather than a source scan: what matters is what ends up in
 * FormData, which is exactly what the browser decides.
 */
function submittedValue(form: HTMLFormElement, field: string) {
  return new FormData(form).get(field);
}

describe("<SearchableSelect> form participation", () => {
  it("submits the selected value when CONTROLLED", () => {
    const { container } = render(
      <form>
        <SearchableSelect
          name="department"
          options={["Science", "Mathematics"]}
          value="Science"
          onChange={vi.fn()}
        />
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(submittedValue(form, "department")).toBe("Science");
  });

  it("submits the selected value when UNCONTROLLED", () => {
    const { container } = render(
      <form>
        <SearchableSelect
          name="department"
          options={["Science", "Mathematics"]}
          defaultValue="Mathematics"
        />
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(submittedValue(form, "department")).toBe("Mathematics");
  });

  it("submits an empty value rather than no field at all when nothing is chosen", () => {
    // The distinction matters: `formData.get()` returning "" is a field the
    // caller can validate, while `null` is a field that does not exist.
    const { container } = render(
      <form>
        <SearchableSelect name="department" options={["Science"]} value="" onChange={vi.fn()} />
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(submittedValue(form, "department")).toBe("");
  });

  it("tracks a controlled value change", () => {
    const { container, rerender } = render(
      <form>
        <SearchableSelect
          name="category"
          options={["Pedagogy", "Science"]}
          value="Pedagogy"
          onChange={vi.fn()}
        />
      </form>,
    );
    const form = container.querySelector("form")!;
    expect(submittedValue(form, "category")).toBe("Pedagogy");

    rerender(
      <form>
        <SearchableSelect
          name="category"
          options={["Pedagogy", "Science"]}
          value="Science"
          onChange={vi.fn()}
        />
      </form>,
    );
    expect(submittedValue(form, "category")).toBe("Science");
  });
});
