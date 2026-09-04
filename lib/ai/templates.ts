// lib/ai/templates.ts
// Bilingual answer templates for the zero-LLM paths. Pure.
//
// These are the sentences a model would have generated at full price for
// requests whose answer is already fully determined by the database — "I found
// 4 books about X", "the library opens at …". Writing them by hand is not a
// downgrade: the phrasing is stable, correct, instantly available, and cannot
// hallucinate. The result cards carry the substance (§14).

import { toKhmerDigits } from "./citations";
import type { AILocale, SearchResult } from "./response";

function n(count: number, locale: AILocale): string {
  return locale === "km" ? toKhmerDigits(count) : String(count);
}

/** Human label for a result type, used in the count sentence. */
function label(type: SearchResult["type"], count: number, locale: AILocale): string {
  if (locale === "km") {
    switch (type) {
      case "research": return "សារណា";
      case "post": return "អត្ថបទព័ត៌មាន";
      case "catalog": return "សៀវភៅក្នុងបញ្ជី";
      case "publication": return "ស្នាដៃបោះពុម្ព";
      case "path": return "មាគ៌ាសិក្សា";
      default: return "សៀវភៅ";
    }
  }
  const plural = count === 1 ? "" : "s";
  switch (type) {
    case "research": return `thesis${count === 1 ? "" : "es"}`;
    case "post": return `post${plural}`;
    case "catalog": return `catalogue record${plural}`;
    case "publication": return `publication${plural}`;
    case "path": return `learning path${plural}`;
    default: return `book${plural}`;
  }
}

/** "I found 4 books about educational psychology." */
export function foundResults(
  results: readonly SearchResult[],
  query: string,
  locale: AILocale,
): string {
  const count = results.length;
  const type = results[0]?.type ?? "book";
  const topic = query.trim();
  if (locale === "km") {
    return topic
      ? `រកឃើញ ${label(type, count, "km")} ចំនួន ${n(count, "km")} ដែលទាក់ទងនឹង «${topic}»។`
      : `រកឃើញ ${label(type, count, "km")} ចំនួន ${n(count, "km")}។`;
  }
  return topic
    ? `I found ${count} ${label(type, count, "en")} related to “${topic}”.`
    : `I found ${count} ${label(type, count, "en")}.`;
}

/** Nothing matched. Always offers a concrete next step. */
export function noResults(query: string, locale: AILocale, suggestions: readonly string[] = []): string {
  const topic = query.trim();
  if (locale === "km") {
    const head = topic
      ? `ខ្ញុំរកមិនឃើញឯកសារអំពី «${topic}» នៅក្នុងបណ្ណាល័យ វ.គ.ភ ទេ។`
      : "ខ្ញុំរកមិនឃើញឯកសារដែលត្រូវនឹងសំណួរនេះទេ។";
    return suggestions.length
      ? `${head} សូមសាកល្បងពាក្យ៖ ${suggestions.join(" · ")}`
      : `${head} សូមសាកល្បងប្រើពាក្យទូលំទូលាយជាងនេះ ឬពិនិត្យបញ្ជីសៀវភៅនៅ /books។`;
  }
  const head = topic
    ? `I couldn’t find anything about “${topic}” in the PTEC Library.`
    : "I couldn’t find anything matching that in the PTEC Library.";
  return suggestions.length
    ? `${head} You could try: ${suggestions.join(" · ")}`
    : `${head} Try a broader term, or browse the collection at /books.`;
}

/** An author or subject hub resolved: how much it holds, and where the full
 *  list lives. The cards carry the first few works. */
export function hubLead(
  hub: { kind: "author" | "subject"; name: string; url: string; count: number },
  shown: number,
  locale: AILocale,
): string {
  const count = n(hub.count, locale);
  if (locale === "km") {
    const what = hub.kind === "author" ? `${hub.name} មានស្នាដៃចំនួន ${count}` : `មុខវិជ្ជា «${hub.name}» មានឯកសារចំនួន ${count}`;
    const more = hub.count > shown ? ` បង្ហាញ ${n(shown, "km")} នៅទីនេះ;` : "";
    return `${what} នៅក្នុងបណ្ណាល័យ វ.គ.ភ។${more} បញ្ជីពេញលេញនៅ ${hub.url}។`;
  }
  const what =
    hub.kind === "author"
      ? `${hub.name} has ${count} work${hub.count === 1 ? "" : "s"}`
      : `The subject “${hub.name}” holds ${count} resource${hub.count === 1 ? "" : "s"}`;
  const more = hub.count > shown ? ` — ${shown} shown here;` : ";";
  return `${what} in the PTEC Library${more} the full list is at ${hub.url}.`;
}

/** "What subjects do you have?" — the index itself, rendered as one line. */
export function subjectOverview(list: string, locale: AILocale): string {
  return locale === "km"
    ? `មុខវិជ្ជានៅក្នុងបណ្ណាល័យ៖ ${list}។ រកមើលទាំងអស់នៅ /subjects។`
    : `The library’s subjects: ${list}. Browse them all at /subjects.`;
}

export function noAuthor(query: string, locale: AILocale): string {
  const name = query.trim();
  if (locale === "km") {
    return name
      ? `ខ្ញុំរកមិនឃើញអ្នកនិពន្ធឈ្មោះ «${name}» នៅក្នុងបណ្ណាល័យទេ។ សូមរកមើលអ្នកនិពន្ធទាំងអស់នៅ /authors។`
      : "សូមប្រាប់ឈ្មោះអ្នកនិពន្ធ ឬរកមើលអ្នកនិពន្ធទាំងអស់នៅ /authors។";
  }
  return name
    ? `I couldn’t find an author named “${name}” in the PTEC Library. Everyone with a listed work is at /authors.`
    : "Tell me the author’s name, or browse everyone with a listed work at /authors.";
}

export function noSubject(query: string, locale: AILocale): string {
  const name = query.trim();
  if (locale === "km") {
    return name
      ? `ខ្ញុំរកមិនឃើញមុខវិជ្ជា «${name}» ទេ។ សូមរកមើលមុខវិជ្ជាទាំងអស់នៅ /subjects។`
      : "សូមរកមើលមុខវិជ្ជាទាំងអស់នៅ /subjects។";
  }
  return name
    ? `I couldn’t find a subject called “${name}”. The full list is at /subjects.`
    : "The full list of subjects is at /subjects.";
}

/** Library fact answer, with the page path that carries the full detail. */
export function factAnswer(text: string, link: string | undefined, locale: AILocale): string {
  if (!text) {
    return locale === "km"
      ? "ព័ត៌មាននេះមិនទាន់មាននៅក្នុងប្រព័ន្ធទេ។ សូមទាក់ទងបណ្ណាល័យដោយផ្ទាល់។"
      : "That information isn’t available in the system yet — please contact the library directly.";
  }
  if (!link) return text;
  return locale === "km" ? `${text} (ព័ត៌មានបន្ថែម៖ ${link})` : `${text} (More at ${link})`;
}

export function greeting(locale: AILocale): string {
  return locale === "km"
    ? "សួស្តី! ខ្ញុំជាជំនួយការបណ្ណាល័យ វ.គ.ភ។ តើអ្នកចង់ស្វែងរកសៀវភៅ សារណា ឬព័ត៌មានអំពីបណ្ណាល័យ?"
    : "Hello! I’m the PTEC Library assistant. I can find books and theses, or answer questions about the library — what are you looking for?";
}

/** Academic-integrity decline (§23) — refuse the task, offer the real help. */
export function academicDecline(locale: AILocale): string {
  return locale === "km"
    ? "ខ្ញុំមិនអាចសរសេរអត្ថបទ កិច្ចការ ឬសារណាជំនួសអ្នកបានទេ។ ប៉ុន្តែខ្ញុំអាចជួយរកឯកសារយោង សៀវភៅ និងសារណាដែលពាក់ព័ន្ធ ដើម្បីឱ្យអ្នកសរសេរដោយខ្លួនឯង។ តើប្រធានបទរបស់អ្នកគឺជាអ្វី?"
    : "I can’t write an essay, assignment or thesis for you. I can help you do it yourself — tell me your topic and I’ll find the books, theses and sources the library holds on it.";
}

/** Book detail from metadata alone. */
export function bookDetail(result: SearchResult, summary: string | undefined, locale: AILocale): string {
  const head = locale === "km"
    ? `«${result.title}» ដោយ ${result.author}`
    : `“${result.title}” by ${result.author}`;
  return summary ? `${head} — ${summary}` : head;
}

/** Related-books lead-in. */
export function relatedLead(count: number, locale: AILocale): string {
  if (count === 0) {
    return locale === "km"
      ? "ខ្ញុំរកមិនឃើញសៀវភៅស្រដៀងគ្នាក្នុងបណ្ណាល័យទេ។"
      : "I couldn’t find closely related titles in the collection.";
  }
  return locale === "km"
    ? `នេះជាសៀវភៅស្រដៀងគ្នាចំនួន ${toKhmerDigits(count)} ពីបណ្ណាល័យ។`
    : `Here ${count === 1 ? "is" : "are"} ${count} related ${count === 1 ? "title" : "titles"} from the collection.`;
}

/** Retrieval produced no page evidence for a document question. */
export function noEvidence(locale: AILocale): string {
  return locale === "km"
    ? "ខ្ញុំរកមិនឃើញអត្ថបទនៅក្នុងឯកសាររបស់បណ្ណាល័យ ដែលឆ្លើយសំណួរនេះទេ។ សូមសាកល្បងសួរឱ្យជាក់លាក់ជាងនេះ ឬបញ្ជាក់ចំណងជើងឯកសារ។"
    : "I couldn’t find a passage in the library’s documents that answers that. Try asking more specifically, or name the document you mean.";
}

/** The model was unavailable but retrieval succeeded (§26). */
export function degraded(locale: AILocale): string {
  return locale === "km"
    ? "ជំនួយការ AI មិនអាចប្រើបានបណ្ដោះអាសន្នទេ ប៉ុន្តែនេះជាលទ្ធផលស្វែងរកពីបណ្ណាល័យ។"
    : "The AI assistant is temporarily unavailable, but here are the matching library results.";
}
