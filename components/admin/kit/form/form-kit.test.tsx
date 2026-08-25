// Pins the two things the admin form kit exists to guarantee: that a control
// rendered through <Field> cannot be missing its accessible wiring, and that
// focusFirstInvalid actually lands on a field the user can see.
//
// Both were absent panel-wide before the kit existed — `aria-invalid` appeared
// on 22 controls out of several hundred, and no admin form focused an invalid
// field at all. A regression here is silent in the browser and invisible to a
// production build, which is why it is a test.

import { beforeAll, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";

import Field from "./Field";
import SlugField from "./SlugField";
import { focusFirstInvalid } from "./focus-first-invalid";

describe("<Field>", () => {
  it("associates the label with the control it renders", () => {
    render(
      <Field label="Journal name">{(p) => <input {...p} name="journal_name" />}</Field>,
    );
    const input = screen.getByLabelText("Journal name");
    expect(input.id).toBeTruthy();
  });

  it("marks a required field on the control, not only with a glyph", () => {
    render(<Field label="Title" required>{(p) => <input {...p} name="title" />}</Field>);
    const input = screen.getByLabelText(/Title/);
    expect(input).toBeRequired();
    // The asterisk is decoration — it must not be read out as part of the name.
    expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
  });

  it("wires aria-invalid and aria-describedby to an announced error", () => {
    render(
      <Field label="Slug" error="Use lowercase letters, numbers and hyphens only.">
        {(p) => <input {...p} name="slug" />}
      </Field>,
    );
    const input = screen.getByLabelText("Slug");
    const error = screen.getByRole("alert");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(error.id);
    expect(error).toHaveTextContent("Use lowercase letters, numbers and hyphens only.");
  });

  it("shows the hint only while there is no error, so the slot never doubles up", () => {
    const { rerender } = render(
      <Field label="DOI" hint="No https://doi.org/ prefix.">
        {(p) => <input {...p} name="doi" />}
      </Field>,
    );
    expect(screen.getByText("No https://doi.org/ prefix.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();

    rerender(
      <Field label="DOI" hint="No https://doi.org/ prefix." error="That is not a DOI.">
        {(p) => <input {...p} name="doi" />}
      </Field>,
    );
    expect(screen.queryByText("No https://doi.org/ prefix.")).toBeNull();
    expect(screen.getByRole("alert")).toHaveTextContent("That is not a DOI.");
  });

  it("leaves aria-invalid and aria-describedby off a clean field", () => {
    render(<Field label="Publisher">{(p) => <input {...p} name="publisher" />}</Field>);
    const input = screen.getByLabelText("Publisher");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });

  it("labels a composite control through htmlFor when children are plain", () => {
    render(
      <Field label="Keywords" htmlFor="kw">
        <input id="kw" name="keywords" />
      </Field>,
    );
    expect(screen.getByLabelText("Keywords")).toHaveAttribute("name", "keywords");
  });
});

describe("focusFirstInvalid", () => {
  // jsdom does not implement scrollIntoView; the helper calls it unconditionally
  // because every real browser has had it for a decade.
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
  });

  it("skips controls inside a hidden panel", () => {
    // Stepped forms keep every panel mounted and hide the inactive ones, so the
    // first invalid control in document order is routinely unreachable.
    const root = document.createElement("div");
    root.innerHTML = `
      <div hidden><input id="hidden-one" aria-invalid="true" /></div>
      <div><input id="visible-one" aria-invalid="true" /></div>
    `;
    document.body.append(root);

    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe("visible-one");

    root.remove();
  });

  it("focuses the control inside a wrapper marked data-invalid", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-invalid="true"><input id="inner" /></div>`;
    document.body.append(root);

    expect(focusFirstInvalid(root)).toBe(true);
    expect(document.activeElement?.id).toBe("inner");

    root.remove();
  });

  it("reports false when there is nothing to focus", () => {
    const root = document.createElement("div");
    root.innerHTML = `<input id="fine" />`;
    document.body.append(root);

    expect(focusFirstInvalid(root)).toBe(false);
    expect(focusFirstInvalid(null)).toBe(false);

    root.remove();
  });
});

describe("<SlugField>", () => {
  // A controlled harness, because the field's whole job is a two-way
  // relationship with a title the parent owns.
  function Harness({ title }: { title: string }) {
    const [slug, setSlug] = useState("");
    return (
      <SlugField
        value={slug}
        onChange={setSlug}
        source={title}
        routePrefix="/catalogs"
        siteUrl="https://library.ptec.edu.kh"
        labels={{
          label: "Slug",
          autoHint: "From the title",
          reset: "Use the title",
          checking: "Checking…",
          available: "Available",
          taken: "Already used",
        }}
      />
    );
  }

  it("derives the slug from the title", () => {
    render(<Harness title="Teaching Practice Handbook" />);
    expect(screen.getByLabelText("Slug")).toHaveValue("teaching-practice-handbook");
  });

  it("keeps a Khmer title's own script rather than dropping it", () => {
    render(<Harness title="សៀវភៅគរុកោសល្យ" />);
    expect(screen.getByLabelText("Slug")).toHaveValue("សៀវភៅគរុកោសល្យ");
  });

  it("shows the URL the record will actually live at", () => {
    render(<Harness title="Teaching Practice" />);
    expect(
      screen.getByText("https://library.ptec.edu.kh/catalogs/teaching-practice"),
    ).toBeInTheDocument();
  });

  it("stops following the title once edited by hand, and can be handed back", async () => {
    const { rerender } = render(<Harness title="First Title" />);
    const input = screen.getByLabelText("Slug");

    fireEvent.change(input, { target: { value: "custom-slug" } });
    rerender(<Harness title="First Title Extended" />);
    expect(input).toHaveValue("custom-slug");

    // Handing it back picks up the title as it stands *now*, not the one the
    // slug was originally derived from.
    fireEvent.click(screen.getByRole("button", { name: "Use the title" }));
    await waitFor(() => expect(input).toHaveValue("first-title-extended"));
  });

  it("announces the availability verdict politely", async () => {
    render(
      <SlugField
        value="taken-slug"
        onChange={() => {}}
        source="Taken Slug"
        routePrefix="/catalogs"
        siteUrl="https://library.ptec.edu.kh"
        checkAvailability={async () => false}
        labels={{
          label: "Slug",
          autoHint: "From the title",
          reset: "Use the title",
          checking: "Checking…",
          available: "Available",
          taken: "Already used",
        }}
      />,
    );
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(status).toHaveTextContent("Already used"), { timeout: 2000 });
  });
});
