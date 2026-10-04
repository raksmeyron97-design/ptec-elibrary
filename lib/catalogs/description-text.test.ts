import { describe, it, expect } from "vitest";
import { descriptionLength, descriptionParagraphs } from "./description-text";

// The opening of the live description on /catalogs/the-body-institute-riggs-carol,
// exactly as stored: hard-wrapped at 57 characters.
const BODY_INSTITUTE =
  "Excerpt of The Body Institute by Carol Riggs\nFive more reps, and I should be done with this body for\ngood.\n\n" +
  "I pull the weight bar down to my chest, working my\nbiceps. Here I am, flat on my back once more, communing\nwith my old buddy the Fluid Resistance Machine.\n\n" +
  "Twenty-six…twenty-seven.\n\n" +
  "Man, I can’t wait to get back into my own body and be\nmyself again. Hanging out with my friends, spending time\nwith my family. Dancing. Urban paintballing. Messing\naround with kinetics experiments at the Catalyst Club.";

describe("descriptionParagraphs", () => {
  it("reflows a hard-wrapped description, keeping its title line", () => {
    expect(descriptionParagraphs(BODY_INSTITUTE)).toEqual([
      ["Excerpt of The Body Institute by Carol Riggs", "Five more reps, and I should be done with this body for good."],
      ["I pull the weight bar down to my chest, working my biceps. Here I am, flat on my back once more, communing with my old buddy the Fluid Resistance Machine."],
      ["Twenty-six…twenty-seven."],
      ["Man, I can’t wait to get back into my own body and be myself again. Hanging out with my friends, spending time with my family. Dancing. Urban paintballing. Messing around with kinetics experiments at the Catalyst Club."],
    ]);
  });

  it("joins a wrap before a capitalised word when that word would not have fitted", () => {
    const text = "aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk\nPhnom Penh is where the college stands, and the line\ncontinues here as wrapped text always does in a sample\nlike this one, and so on.";
    expect(descriptionParagraphs(text)).toEqual([
      ["aaaa bbbb cccc dddd eeee ffff gggg hhhh iiii jjjj kkkk Phnom Penh is where the college stands, and the line continues here as wrapped text always does in a sample like this one, and so on."],
    ]);
  });

  it("leaves intentional line breaks alone: a list, a short poem, a Khmer text", () => {
    const list = "A sampling of the topics covered:\n\n• Whole-class discussion methods.\n• Learning through tasks.\n• Teaching using the five strands.";
    expect(descriptionParagraphs(list)).toEqual([
      ["A sampling of the topics covered:"],
      ["• Whole-class discussion methods.", "• Learning through tasks.", "• Teaching using the five strands."],
    ]);
    const poem = "Roses are red,\nViolets are blue,\nSugar is sweet,\nAnd so are you.";
    expect(descriptionParagraphs(poem)).toEqual([["Roses are red,", "Violets are blue,", "Sugar is sweet,", "And so are you."]]);
    expect(descriptionParagraphs("សៀវភៅនេះពន្យល់\nពីវិធីបង្រៀន")).toEqual([["សៀវភៅនេះពន្យល់", "ពីវិធីបង្រៀន"]]);
  });

  it("keeps list items apart even inside wrapped text", () => {
    const text = "This handbook covers the work of the assistant principal\nin depth, and the many roles that the position plays in a\nschool, with chapters on:\n• Policy concerns\n• Upward mobility";
    expect(descriptionParagraphs(text)).toEqual([
      ["This handbook covers the work of the assistant principal in depth, and the many roles that the position plays in a school, with chapters on:", "• Policy concerns", "• Upward mobility"],
    ]);
  });

  it("rejoins a word split by the wrap", () => {
    const text = "Children build their self-\nesteem through play, and the\nauthors show how it happens\nin the classroom every day.";
    expect(descriptionParagraphs(text)).toEqual([["Children build their self-esteem through play, and the authors show how it happens in the classroom every day."]]);
  });

  it("normalises Windows line ends, stray spaces and empty input", () => {
    expect(descriptionParagraphs("One paragraph.  \r\n\r\n\r\nTwo   paragraphs. ")).toEqual([["One paragraph."], ["Two paragraphs."]]);
    expect(descriptionParagraphs("   ")).toEqual([]);
    expect(descriptionParagraphs(null)).toEqual([]);
  });

  it("measures length as read", () => {
    expect(descriptionLength([["ab", "cd"], ["e"]])).toBe(5);
  });
});
