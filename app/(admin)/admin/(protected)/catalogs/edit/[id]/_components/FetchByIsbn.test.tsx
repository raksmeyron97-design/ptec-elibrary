// "Fetch by ISBN" on the edit form, through the real EditBookWizard: the
// values land in the form's own fields (and nowhere else), a filled field is
// never overwritten unasked, and a found book with another title fills
// nothing — the ISBN first given for Fidler's book (9781853963285) is
// Open Library's "Educational management today".

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import ToastProvider from "@/components/admin/kit/ToastProvider";
import EditBookWizard from "./EditBookWizard";
import { lookupCatalogIsbn, type IsbnLookupResponse } from "../../../isbn-actions";
import type { CatalogBook } from "@/lib/catalog";
import type { IsbnCandidate } from "@/lib/isbn/types";

vi.mock("../../../isbn-actions", () => ({ lookupCatalogIsbn: vi.fn() }));
vi.mock("../../../actions", () => ({ updateCatalogBook: vi.fn(), checkCatalogSlugAvailable: vi.fn().mockResolvedValue(true) }));
vi.mock("../../../_components/CopiesPanel", () => ({ default: () => null }));
vi.mock("@/app/actions/tags", () => ({ getAllTags: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../publisher-actions", () => ({ fetchPublisherDescription: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const lookup = vi.mocked(lookupCatalogIsbn);

const fidler: CatalogBook = {
  id: "d45a6059", slug: "strategic-management-for-school-development-fidler-brian",
  title: "Strategic management for school development : leading your school's improvement strategy",
  author: "Fidler Brian", description: null, cover_url: null, isbn: null, publisher: null, year: null, language: "en",
  category: null, department: null, ddc: null, shelf_location: null, copies_total: 1, copies_available: 1,
  accession_number: null, cover_color: "#000", is_active: true, created_at: "", updated_at: "", keywords: [],
  seo_title: null, seo_description: null, og_image: null, koha_biblio_id: null,
};

const candidate = (over: Partial<IsbnCandidate>): IsbnCandidate => ({
  provider: "open_library", providerRecordId: "/books/OL1M", title: "Strategic Management for School Development", subtitle: null,
  authors: ["Brian Fidler"], publisher: "Paul Chapman Educational Publishing", year: 2002, language: "eng", pageCount: null,
  edition: null, subjects: ["Strategic planning"], description: null, coverSource: null,
  isbn13: "9780761965268", isbn10: "0761965262", ...over,
});

const ok = (candidates: IsbnCandidate[], over: Partial<Extract<IsbnLookupResponse, { status: "ok" }>> = {}): IsbnLookupResponse => ({
  status: "ok", isbn13: "9780761965268", isbn10: "0761965262", local: [], koha: { status: "not_connected" }, lookedUp: true,
  candidates,
  outcomes: [
    { provider: "open_library", status: "found", count: 1, cached: false },
    { provider: "google_books", status: candidates.some((c) => c.provider === "google_books") ? "found" : "not_found", count: 1, cached: false } as never,
  ],
  ...over,
});

function renderForm(book: CatalogBook = fidler) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ToastProvider>
        <EditBookWizard book={book} coverSource="generated" categories={[]} initialCopies={[]} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
  const input = (name: string) => view.container.querySelector(`[name="${name}"]`) as HTMLInputElement;
  const button = () => screen.getByRole("button", { name: /Fetch details via ISBN/ });
  return { ...view, input, button };
}

beforeEach(() => lookup.mockReset());

describe("About this book on the edit form", () => {
  it("is on the first tab, beside the facts it describes", () => {
    const { input } = renderForm({ ...fidler, description: "Strategic planning for schools." });
    const info = document.getElementById("catalog-panel-info")!;
    expect(info).not.toHaveAttribute("hidden");
    expect(info.contains(input("description"))).toBe(true);
    expect(input("description").value).toBe("Strategic planning for schools.");
    expect(screen.getByLabelText("About this book / Description")).toBe(input("description"));
    expect(document.getElementById("catalog-panel-media")!.querySelector('[name="description"]')).toBeNull();
  });
});

describe("Fetch by ISBN on the edit form", () => {
  it("waits for a valid ISBN", () => {
    const { input, button } = renderForm();
    expect(button()).toBeDisabled();
    fireEvent.change(input("isbn"), { target: { value: "9780761965269" } }); // bad check digit
    expect(button()).toBeDisabled();
    fireEvent.change(input("isbn"), { target: { value: "978-0-7619-6526-8" } });
    expect(button()).toBeEnabled();
  });

  it("fills the empty fields, description included, and saves nothing", async () => {
    lookup.mockResolvedValue(ok([
      candidate({}),
      candidate({ provider: "google_books", providerRecordId: "g1", publisher: "SAGE", description: "How a school plans its improvement." }),
    ]));
    const { input, button } = renderForm();
    fireEvent.change(input("isbn"), { target: { value: "9780761965268" } });
    fireEvent.click(button());

    await waitFor(() => expect(input("publisher").value).toBe("Paul Chapman Educational Publishing"));
    expect(lookup).toHaveBeenCalledWith("9780761965268", { lookUpEvenIfCatalogued: true });
    expect(input("year").value).toBe("2002");
    expect((input("description") as unknown as HTMLTextAreaElement).value).toBe("How a school plans its improvement.");
    expect(input("keywords").value).toContain("Strategic planning");
    expect(await screen.findByText(/Filled Description, Publisher, Year, Keywords from Google Books, Open Library/)).toBeInTheDocument();
    // Dirty, so Save is offered — and nothing has been saved.
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("fills nothing when the ISBN belongs to another book, until told it is this one", async () => {
    lookup.mockResolvedValue(ok([candidate({ title: "Educational management today", publisher: "Paul Chapman Publishing Ltd.", year: 1996 })]));
    const { input, button } = renderForm();
    fireEvent.change(input("isbn"), { target: { value: "9781853963285" } });
    fireEvent.click(button());

    expect(await screen.findByText(/lists this ISBN as “Educational management today”/)).toBeInTheDocument();
    expect(input("publisher").value).toBe("");
    expect(input("year").value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /fill anyway/ }));
    expect(input("year").value).toBe("1996");
  });

  it("offers, never applies, a value that differs from one already there", async () => {
    lookup.mockResolvedValue(ok([candidate({})]));
    const { input, button } = renderForm({ ...fidler, publisher: "Paul Chapman", year: 2001 });
    fireEvent.change(input("isbn"), { target: { value: "9780761965268" } });
    fireEvent.click(button());

    expect(await screen.findByText(/already hold something different/)).toBeInTheDocument();
    expect(input("publisher").value).toBe("Paul Chapman");
    expect(input("year").value).toBe("2001");

    fireEvent.click(screen.getByRole("checkbox", { name: /Year/ }));
    fireEvent.click(screen.getByRole("button", { name: "Replace selected" }));
    expect(input("year").value).toBe("2002");
    expect(input("publisher").value).toBe("Paul Chapman");
  });

  it("does not call a partial answer 'not found'", async () => {
    lookup.mockResolvedValue(ok([], {
      outcomes: [
        { provider: "open_library", status: "not_found", cached: false },
        { provider: "google_books", status: "error", kind: "quota", message: "quota" },
      ],
    }));
    const { input, button } = renderForm();
    fireEvent.change(input("isbn"), { target: { value: "9780761965268" } });
    fireEvent.click(button());
    expect(await screen.findByText(/not every source answered/)).toBeInTheDocument();
    expect(screen.getByText(/Daily quota reached/)).toBeInTheDocument();
  });
});
