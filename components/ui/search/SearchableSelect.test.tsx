import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
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

/**
 * The second contract: a widget that CLAIMS to be a listbox must be one.
 *
 * The trigger shipped with `aria-haspopup="listbox"` and `aria-expanded`, but
 * the popup it opened was a plain `<ul>` of `<li onClick>` — no `role`, no
 * `tabindex`, no `aria-selected`, and no key handler anywhere. So a screen
 * reader was told a listbox had expanded and then found no listbox and no
 * options, and a keyboard user could open the menu and do nothing at all with
 * it. Verified against the running admin panel: ArrowDown on the focused
 * trigger left focus on the trigger and changed nothing.
 *
 * That matters at scale rather than in one place — this component backs 15
 * call sites, including the e-book/thesis/user/announcement filters and two
 * PUBLIC surfaces (publication filters, thesis advanced search), so every
 * filter in the admin panel was mouse-only.
 */
describe("<SearchableSelect> keyboard and ARIA", () => {
  const OPTIONS = ["Pedagogy", "Science", "Mathematics"];

  function open(container: HTMLElement) {
    const trigger = container.querySelector("button")!;
    fireEvent.click(trigger);
    return trigger;
  }

  function optionNodes(container: HTMLElement) {
    return [...container.querySelectorAll('[role="option"]')] as HTMLElement[];
  }

  /** What `aria-activedescendant` currently points at, as text. */
  function activeOptionText(container: HTMLElement) {
    const input = container.querySelector('[role="combobox"]')!;
    const id = input.getAttribute("aria-activedescendant");
    return id ? container.querySelector(`[id="${id}"]`)?.textContent?.trim() ?? null : null;
  }

  it("exposes a real listbox with real options once open", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="Science" onChange={vi.fn()} />,
    );
    const trigger = open(container);

    const listbox = container.querySelector('[role="listbox"]');
    expect(listbox, "the popup must be the listbox the trigger promises").not.toBeNull();
    expect(trigger.getAttribute("aria-controls")).toBe(listbox!.getAttribute("id"));
    expect(optionNodes(container).map((o) => o.textContent?.trim())).toEqual(OPTIONS);
  });

  it("marks the chosen option as selected, and only that one", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="Science" onChange={vi.fn()} />,
    );
    open(container);
    const selected = optionNodes(container).filter((o) => o.getAttribute("aria-selected") === "true");
    expect(selected.map((o) => o.textContent?.trim())).toEqual(["Science"]);
  });

  it("opens from the trigger with ArrowDown, cursor on the first option", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={vi.fn()} />,
    );
    const trigger = container.querySelector("button")!;
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(activeOptionText(container)).toBe("Pedagogy");
  });

  it("moves the cursor with the arrow keys and wraps at both ends", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={vi.fn()} />,
    );
    open(container);
    const input = container.querySelector('[role="combobox"]')!;

    // A freshly opened list has no cursor: the list is announced before a value.
    expect(activeOptionText(container)).toBeNull();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText(container)).toBe("Pedagogy");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText(container)).toBe("Science");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText(container)).toBe("Pedagogy");
    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(activeOptionText(container), "wraps backwards to the last option").toBe("Mathematics");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText(container), "wraps forwards to the first option").toBe("Pedagogy");
  });

  it("moving the cursor is not choosing: onChange fires on Enter, not on arrows", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={onChange} />,
    );
    open(container);
    const input = container.querySelector('[role="combobox"]')!;

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(onChange, "arrowing must not commit a value").not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Science");
    expect(container.querySelector('[role="listbox"]'), "selecting closes the list").toBeNull();
  });

  it("selects what the search field has narrowed to", () => {
    const onChange = vi.fn();
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={onChange} />,
    );
    open(container);
    const input = container.querySelector('[role="combobox"]') as HTMLInputElement;

    fireEvent.change(input, { target: { value: "math" } });
    expect(optionNodes(container).map((o) => o.textContent?.trim())).toEqual(["Mathematics"]);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledExactlyOnceWith("Mathematics");
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={vi.fn()} />,
    );
    const trigger = open(container);
    fireEvent.keyDown(container.querySelector('[role="combobox"]')!, { key: "Escape" });

    expect(container.querySelector('[role="listbox"]')).toBeNull();
    // The popup is unmounted on close, so without an explicit hand-back focus
    // falls to <body> and the user loses their place in the form.
    expect(document.activeElement).toBe(trigger);
  });

  it("Enter never submits the surrounding form", () => {
    // These live inside admin forms; a bare Enter in the search field used to
    // be the only reason the old handler existed, and that must survive.
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <SearchableSelect name="category" options={OPTIONS} value="" onChange={vi.fn()} />
      </form>,
    );
    open(container);
    fireEvent.keyDown(container.querySelector('[role="combobox"]')!, { key: "Enter" });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not offer the empty state as something to choose", () => {
    const { container } = render(
      <SearchableSelect name="category" options={OPTIONS} value="" onChange={vi.fn()} />,
    );
    open(container);
    const input = container.querySelector('[role="combobox"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: "zzzz" } });

    expect(container.textContent).toContain("No results found.");
    expect(optionNodes(container), "the message is not an option").toEqual([]);
    // Arrowing onto nothing must not throw or invent a cursor.
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(activeOptionText(container)).toBeNull();
  });
});
