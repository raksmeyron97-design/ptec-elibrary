import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import TagInput from "./TagInput";

vi.mock("@/app/actions/tags", () => ({
  getAllTags: vi.fn().mockResolvedValue(["Algebra", "Geometry"]),
}));

describe("<TagInput>", () => {
  it("renders both options (Manual and Paste modes) and defaults to Manual mode", async () => {
    await act(async () => {
      render(<TagInput name="keywords" placeholder="Add keywords..." />);
    });

    expect(screen.getByRole("tab", { name: /វាយម្តងមួយ/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /បិទភ្ជាប់ជាបណ្តុំ/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add keywords...")).toBeInTheDocument();
  });

  it("Option 1 (Manual / ដូចមុន): adds single tags on Enter or comma keydown", async () => {
    render(<TagInput name="keywords" placeholder="Add keywords..." />);
    const input = screen.getByPlaceholderText("Add keywords...");

    // Type and press comma
    await act(async () => {
      fireEvent.change(input, { target: { value: "Algorithms" } });
      fireEvent.keyDown(input, { key: "," });
    });
    expect(screen.getByText("Algorithms")).toBeInTheDocument();
    expect(input).toHaveValue("");

    // Type and press Enter
    await act(async () => {
      fireEvent.change(input, { target: { value: "Data Structures" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByText("Data Structures")).toBeInTheDocument();
    expect(input).toHaveValue("");

    const hiddenInput = document.querySelector('input[type="hidden"][name="keywords"]') as HTMLInputElement;
    expect(hiddenInput.value).toBe("Algorithms,Data Structures");
  });

  it("Option 2 (Paste / ដូចយើងទើបតែធ្វើ): splits comma-separated keywords when pasted", async () => {
    const handleChange = vi.fn();
    render(
      <TagInput
        name="keywords"
        placeholder="Add keywords..."
        onChange={handleChange}
      />
    );

    // Switch to Paste mode
    const pasteTab = screen.getByRole("tab", { name: /បិទភ្ជាប់ជាបណ្តុំ/i });
    await act(async () => {
      fireEvent.click(pasteTab);
    });

    const textarea = screen.getByPlaceholderText(/បិទភ្ជាប់ពាក្យគន្លឹះ/i);
    const sampleKeywords =
      "Research Design, Qualitative Methods, Quantitative Research, Mixed Methods, Research Methodology, Philosophy of Science, Literature Review, Purpose Statement, Data Collection, SAGE";

    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: {
          getData: (format: string) => (format === "text" ? sampleKeywords : ""),
        },
      });
    });

    // Check that each keyword exists as an individual badge
    expect(screen.getByText("Research Design")).toBeInTheDocument();
    expect(screen.getByText("Qualitative Methods")).toBeInTheDocument();
    expect(screen.getByText("Quantitative Research")).toBeInTheDocument();
    expect(screen.getByText("Mixed Methods")).toBeInTheDocument();
    expect(screen.getByText("Research Methodology")).toBeInTheDocument();
    expect(screen.getByText("Philosophy of Science")).toBeInTheDocument();
    expect(screen.getByText("Literature Review")).toBeInTheDocument();
    expect(screen.getByText("Purpose Statement")).toBeInTheDocument();
    expect(screen.getByText("Data Collection")).toBeInTheDocument();
    expect(screen.getByText("SAGE")).toBeInTheDocument();

    // Check hidden input value
    const hiddenInput = document.querySelector('input[type="hidden"][name="keywords"]') as HTMLInputElement;
    expect(hiddenInput).not.toBeNull();
    expect(hiddenInput.value).toBe(
      "Research Design,Qualitative Methods,Quantitative Research,Mixed Methods,Research Methodology,Philosophy of Science,Literature Review,Purpose Statement,Data Collection,SAGE"
    );
  });

  it("Option 2 (Paste): adds tags via 'បន្ថែម (Add)' button when typing into textarea", async () => {
    render(<TagInput name="keywords" />);

    // Switch to Paste mode
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /បិទភ្ជាប់ជាបណ្តុំ/i }));
    });

    const textarea = screen.getByPlaceholderText(/បិទភ្ជាប់ពាក្យគន្លឹះ/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: "Deep Learning, Neural Networks, AI" } });
    });

    const addButton = screen.getByRole("button", { name: /បន្ថែម/i });
    await act(async () => {
      fireEvent.click(addButton);
    });

    expect(screen.getByText("Deep Learning")).toBeInTheDocument();
    expect(screen.getByText("Neural Networks")).toBeInTheDocument();
    expect(screen.getByText("AI")).toBeInTheDocument();
    expect(textarea).toHaveValue("");
  });

  it("switching between modes preserves existing tags", async () => {
    render(<TagInput name="tags" placeholder="Add a tag..." />);

    // Add tag in manual mode
    const input = screen.getByPlaceholderText("Add a tag...");
    await act(async () => {
      fireEvent.change(input, { target: { value: "Tag-1" } });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(screen.getByText("Tag-1")).toBeInTheDocument();

    // Switch to paste mode
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /បិទភ្ជាប់ជាបណ្តុំ/i }));
    });
    // Tag-1 should still be visible in paste mode
    expect(screen.getByText("Tag-1")).toBeInTheDocument();

    // Add another tag via paste mode
    const textarea = screen.getByPlaceholderText(/បិទភ្ជាប់ពាក្យគន្លឹះ/i);
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { getData: () => "Tag-2, Tag-3" },
      });
    });
    expect(screen.getByText("Tag-2")).toBeInTheDocument();
    expect(screen.getByText("Tag-3")).toBeInTheDocument();

    // Switch back to manual mode
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /វាយម្តងមួយ/i }));
    });
    expect(screen.getByText("Tag-1")).toBeInTheDocument();
    expect(screen.getByText("Tag-2")).toBeInTheDocument();
    expect(screen.getByText("Tag-3")).toBeInTheDocument();
  });

  it("respects max limit and removes duplicate tags in paste mode", async () => {
    render(<TagInput name="tags" max={3} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /បិទភ្ជាប់ជាបណ្តុំ/i }));
    });

    const textarea = screen.getByPlaceholderText(/បិទភ្ជាប់ពាក្យគន្លឹះ/i);
    await act(async () => {
      fireEvent.paste(textarea, {
        clipboardData: { getData: () => "Alpha, alpha, BETA, Gamma, Delta" },
      });
    });

    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("BETA")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.queryByText("Delta")).toBeNull();
  });
});
