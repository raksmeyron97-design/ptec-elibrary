// "Fetch by ISBN" on the edit form, through the real EditBookWizard
// (docs/CATALOG-REVIEW.md, Slice 5): each source's status is shown as it really
// answers, the answer is a PREVIEW — nothing reaches the form until Apply —
// a filled field is never overwritten unasked, a found book with another title
// fills nothing (the ISBN first given for Fidler's book, 9781853963285, is
// Open Library's "Educational management today"), and editions are choices,
// never a merge.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "@/messages/en.json";
import ToastProvider from "@/components/admin/kit/ToastProvider";
import EditBookWizard from "./EditBookWizard";
import { checkIsbnIdentity, lookupIsbnProviders, type IsbnProvidersResponse } from "../../../isbn-actions";
import type { CatalogBook } from "@/lib/catalog";
import type { IsbnCandidate } from "@/lib/isbn/types";

vi.mock("../../../isbn-actions", () => ({ checkIsbnIdentity: vi.fn(), lookupIsbnProviders: vi.fn() }));
vi.mock("../../../review/actions", () => ({ recordFieldSources: vi.fn().mockResolvedValue({ ok: true, recorded: 0 }) }));
vi.mock("../../../actions", () => ({ updateCatalogBook: vi.fn(), checkCatalogSlugAvailable: vi.fn().mockResolvedValue(true) }));
vi.mock("../../../_components/CopiesPanel", () => ({ default: () => null }));
vi.mock("@/app/actions/tags", () => ({ getAllTags: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../publisher-actions", () => ({ fetchPublisherDescription: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  // The editor keeps tab state on its own path (the edit route or the review workspace).
  usePathname: () => "/admin/catalogs/edit/b1",
}));

const identity = vi.mocked(checkIsbnIdentity);
const providers = vi.mocked(lookupIsbnProviders);

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

const ok = (candidates: IsbnCandidate[], over: Partial<Extract<IsbnProvidersResponse, { status: "ok" }>> = {}): IsbnProvidersResponse => ({
  status: "ok",
  candidates,
  outcomes: [
    { provider: "open_library", status: "found", count: 1, cached: false },
    { provider: "google_books", status: candidates.some((c) => c.provider === "google_books") ? "found" : "not_found", count: 1, cached: false } as never,
  ],
  ...over,
});

const identityOk = { status: "ok" as const, isbn13: "9780761965268", isbn10: "0761965262", local: [], koha: { status: "not_connected" as const } };

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

beforeEach(() => {
  identity.mockReset();
  providers.mockReset();
  identity.mockResolvedValue(identityOk);
});

async function fetchFor(isbn: string, form: ReturnType<typeof renderForm>) {
  fireEvent.change(form.input("isbn"), { target: { value: isbn } });
  fireEvent.click(form.button());
}

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

  it("shows each step as it really finishes: the catalogue and Koha first, the providers after", async () => {
    let answer!: (v: IsbnProvidersResponse) => void;
    providers.mockReturnValue(new Promise((r) => (answer = r)));
    const form = renderForm();
    await fetchFor("9780761965268", form);

    expect(await screen.findByText(/no other record has this ISBN/)).toBeInTheDocument();
    expect(screen.getByText(/Koha:/).parentElement).toHaveTextContent("not connected");
    // The providers have not answered: they say so, rather than a progress bar pretending.
    expect(screen.getAllByText("asking…")).toHaveLength(2);
    expect(providers).toHaveBeenCalledWith("9780761965268");

    answer(ok([candidate({})]));
    expect(await screen.findByText(/Found for this ISBN/)).toBeInTheDocument();
    expect(screen.queryByText("asking…")).toBeNull();
  });

  it("previews first: nothing reaches the form until Apply, then the empty fields are filled — and nothing is saved", async () => {
    providers.mockResolvedValue(ok([
      candidate({}),
      candidate({ provider: "google_books", providerRecordId: "g1", publisher: "Paul Chapman Educational Publishing", description: "How a school plans its improvement." }),
    ]));
    const form = renderForm();
    await fetchFor("9780761965268", form);

    expect(await screen.findByText(/Safe to apply/)).toBeInTheDocument();
    expect(form.input("publisher").value).toBe("");
    expect(screen.getByText(/No trusted data/)).toBeInTheDocument();
    expect(screen.getByText(/Category, Department, Call number, Shelf/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Apply 4 fields/ }));
    expect(form.input("publisher").value).toBe("Paul Chapman Educational Publishing");
    expect(form.input("year").value).toBe("2002");
    expect((form.input("description") as unknown as HTMLTextAreaElement).value).toBe("How a school plans its improvement.");
    expect(form.input("keywords").value).toContain("Strategic planning");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("fills nothing when the ISBN belongs to another book; 'use anyway' still goes through the preview", async () => {
    providers.mockResolvedValue(ok([candidate({ title: "Educational management today", publisher: "Paul Chapman Publishing Ltd.", year: 1996 })]));
    const form = renderForm();
    await fetchFor("9781853963285", form);

    expect(await screen.findByText("Possible mismatch")).toBeInTheDocument();
    expect(screen.getByText(/lists this ISBN as “Educational management today”/)).toBeInTheDocument();
    expect(form.input("year").value).toBe("");

    fireEvent.click(screen.getByRole("button", { name: /fill anyway/ }));
    expect(form.input("year").value).toBe("");
    fireEvent.click(await screen.findByRole("button", { name: /Apply/ }));
    expect(form.input("year").value).toBe("1996");
  });

  it("a value that differs from one already there is offered unticked, and kept unless ticked", async () => {
    providers.mockResolvedValue(ok([candidate({})]));
    const form = renderForm({ ...fidler, publisher: "Paul Chapman", year: 2001 });
    await fetchFor("9780761965268", form);

    expect(await screen.findByText(/Needs review/)).toBeInTheDocument();
    const year = screen.getByRole("checkbox", { name: /Year/ });
    expect(year).not.toBeChecked();
    fireEvent.click(year);
    fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
    expect(form.input("year").value).toBe("2002");
    expect(form.input("publisher").value).toBe("Paul Chapman");
  });

  it("editions are choices, never merged", async () => {
    providers.mockResolvedValue(ok([
      candidate({ year: 2002, publisher: "Paul Chapman" }),
      candidate({ provider: "google_books", providerRecordId: "g1", year: 2008, publisher: "SAGE" }),
    ]));
    const form = renderForm();
    await fetchFor("9780761965268", form);

    expect(await screen.findByText(/Several editions share this ISBN/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Use this edition" })).toHaveLength(2);
    expect(screen.getAllByText(/exact ISBN match/)).toHaveLength(2);
    fireEvent.click(screen.getAllByRole("button", { name: "Use this edition" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: /Apply/ }));
    expect(form.input("year").value).toBe("2008");
    expect(form.input("publisher").value).toBe("SAGE");
  });

  it("does not call a partial answer 'not found'", async () => {
    providers.mockResolvedValue(ok([], {
      outcomes: [
        { provider: "open_library", status: "not_found", cached: false },
        { provider: "google_books", status: "error", kind: "quota", message: "quota" },
      ],
    }));
    const form = renderForm();
    await fetchFor("9780761965268", form);
    expect(await screen.findByText(/not every source answered/)).toBeInTheDocument();
    expect(screen.getByText(/Daily quota reached/)).toBeInTheDocument();
  });

  it("a rate limit stops at the step that hit it, and asks no provider", async () => {
    identity.mockResolvedValue({ status: "rate_limited" });
    const form = renderForm();
    await fetchFor("9780761965268", form);
    await waitFor(() => expect(screen.getAllByText("not asked").length).toBeGreaterThan(0));
    expect(providers).not.toHaveBeenCalled();
  });
});
