// "About this book / Description" with "Fetch from publisher link": the
// fetched text lands in the field the form saves, an existing description is
// replaced only after a confirmation, and Enter in the link box fetches — it
// never submits (saves) the whole form.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import BookDescriptionField from "./BookDescriptionField";
import { fetchPublisherDescription } from "@/app/(admin)/admin/(protected)/catalogs/publisher-actions";

vi.mock("@/app/(admin)/admin/(protected)/catalogs/publisher-actions", () => ({ fetchPublisherDescription: vi.fn() }));
const fetchMock = vi.mocked(fetchPublisherDescription);

const SPRINGER = "https://link.springer.com/book/10.1007/978-0-387-09742-8";
const ABOUT = "For too many students, mathematics consists of facts in a vacuum, to be memorized because the instructor says so.";

function renderField(defaultValue: string | null = null) {
  const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
  const onChanged = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <form onSubmit={onSubmit}>
        <BookDescriptionField defaultValue={defaultValue} onChanged={onChanged} />
      </form>
    </NextIntlClientProvider>,
  );
  const textarea = () => screen.getByLabelText("About this book / Description") as HTMLTextAreaElement;
  const link = () => screen.getByLabelText("Fetch from Publisher Link") as HTMLInputElement;
  const button = () => screen.getByRole("button", { name: "Fetch" });
  return { ...view, onSubmit, onChanged, textarea, link, button };
}

beforeEach(() => fetchMock.mockReset());

describe("BookDescriptionField", () => {
  it("is the form's description field, and the link box is not a field", () => {
    const { textarea, link, container } = renderField("Already here.");
    expect(textarea().name).toBe("description");
    expect(textarea().value).toBe("Already here.");
    expect(link().name).toBe("");
    expect(new FormData(container.querySelector("form")!).get("description")).toBe("Already here.");
  });

  it("waits for something that looks like a link", () => {
    const { link, button } = renderField();
    expect(button()).toBeDisabled();
    fireEvent.change(link(), { target: { value: "springer" } });
    expect(button()).toBeDisabled();
    fireEvent.change(link(), { target: { value: SPRINGER } });
    expect(button()).toBeEnabled();
  });

  it("fills an empty description and says where it came from", async () => {
    fetchMock.mockResolvedValue({ ok: true, description: ABOUT, source: "about_section", truncated: false, host: "link.springer.com" });
    const { link, button, textarea, onChanged } = renderField();
    fireEvent.change(link(), { target: { value: SPRINGER } });
    fireEvent.click(button());
    await waitFor(() => expect(textarea().value).toBe(ABOUT));
    expect(fetchMock).toHaveBeenCalledWith(SPRINGER);
    expect(onChanged).toHaveBeenCalled();
    expect(screen.getByText(/Filled from link.springer.com \(its “About this book” section\)/)).toBeInTheDocument();
  });

  it("fetches on Enter in the link box, without submitting the form", async () => {
    fetchMock.mockResolvedValue({ ok: true, description: ABOUT, source: "meta", truncated: true, host: "us.sagepub.com" });
    const { link, textarea, onSubmit } = renderField();
    fireEvent.change(link(), { target: { value: "https://us.sagepub.com/en-us/nam/book226425" } });
    fireEvent.keyDown(link(), { key: "Enter" });
    await waitFor(() => expect(textarea().value).toBe(ABOUT));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/only gives a shortened text/)).toBeInTheDocument();
  });

  it("asks before replacing a description already there", async () => {
    fetchMock.mockResolvedValue({ ok: true, description: ABOUT, source: "about_section", truncated: false, host: "link.springer.com" });
    const { link, button, textarea, onChanged } = renderField("A librarian's own summary.");
    fireEvent.change(link(), { target: { value: SPRINGER } });
    fireEvent.click(button());

    expect(await screen.findByText("Replace the current description?")).toBeInTheDocument();
    expect(textarea().value).toBe("A librarian's own summary.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(textarea().value).toBe("A librarian's own summary.");
    expect(onChanged).not.toHaveBeenCalled();

    fireEvent.click(button());
    fireEvent.click(await screen.findByRole("button", { name: "Replace" }));
    expect(textarea().value).toBe(ABOUT);
    expect(onChanged).toHaveBeenCalled();
  });

  it("explains a site that blocks automatic reading", async () => {
    fetchMock.mockResolvedValue({ ok: false, error: "bot_wall", status: 202 });
    const { link, button, textarea } = renderField();
    fireEvent.change(link(), { target: { value: "https://global.oup.com/academic/product/9780199659432" } });
    fireEvent.click(button());
    expect(await screen.findByRole("alert")).toHaveTextContent(/blocks automatic reading/);
    expect(textarea().value).toBe("");
  });
});
