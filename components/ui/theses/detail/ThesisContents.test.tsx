import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";

import enMessages from "@/messages/en.json";
import kmMessages from "@/messages/km.json";
import ThesisContents from "./ThesisContents";

const ENTRIES = [
  { level: 1 as const, label: "ABSTRACT", page: "iii" },
  { level: 1 as const, number: "1", label: "INTRODUCTION", page: "1" },
  { level: 2 as const, number: "1.1", label: "Background", page: "1" },
  { level: 1 as const, number: "២", label: "ការសិក្សាឯកសារ", page: "៩" },
  { level: 1 as const, label: "APPENDICES" },
];

function renderContents(locale: "en" | "km" = "en") {
  return render(
    <NextIntlClientProvider locale={locale} messages={locale === "km" ? kmMessages : enMessages}>
      <ThesisContents entries={ENTRIES} />
    </NextIntlClientProvider>,
  );
}

describe("ThesisContents", () => {
  it("lists every entry in order, with its printed page", () => {
    renderContents();
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows[0].textContent).toBe("ABSTRACTp. iii");
    expect(rows[2].textContent).toBe("1.1Backgroundp. 1");
  });

  it("indents sections under their chapter", () => {
    renderContents();
    const rows = screen.getAllByRole("listitem");
    expect(rows[2].className).toContain("pl-6");
    expect(rows[1].className).not.toContain("pl-6");
  });

  it("marks Khmer labels as Khmer and prints no page it does not have", () => {
    renderContents();
    expect(screen.getByText("ការសិក្សាឯកសារ")).toHaveAttribute("lang", "km");
    expect(screen.getByText("INTRODUCTION")).not.toHaveAttribute("lang");
    expect(screen.getAllByRole("listitem")[4].textContent).toBe("APPENDICES");
  });

  it("says the numbers are printed pages, and never links them", () => {
    renderContents("km");
    expect(screen.getByText(kmMessages.thesisDetail.contentsPrinted)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});
