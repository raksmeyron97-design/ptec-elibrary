// Pure validation for the /contact form — shared shape between the client
// form (fast feedback) and the /api/contact route (source of truth). No I/O
// here so it's trivially unit-testable.

export const CONTACT_CATEGORIES = [
  "general",
  "book_request",
  "thesis_research",
  "account_problem",
  "technical_problem",
  "other",
] as const;

export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  general: "General Question",
  book_request: "Book Request",
  thesis_research: "Thesis / Research",
  account_problem: "Account Problem",
  technical_problem: "Technical Problem",
  other: "Other",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const MAX_NAME = 100;
const MAX_SUBJECT = 200;
const MAX_MESSAGE = 5000;
const MAX_PHONE = 30;

/** The length limits, for a client that words its own messages. */
export const CONTACT_LIMITS = { name: MAX_NAME, subject: MAX_SUBJECT, message: MAX_MESSAGE, phone: MAX_PHONE } as const;

/** Why a field failed, independent of language. `errors` stays English for
 *  the API route (and its logs); the form translates `codes` instead. */
export type ContactErrorCode = "required" | "tooLong" | "invalid";

export interface ContactInput {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  category: string;
  message: string;
}

export interface ContactValidationResult {
  valid: boolean;
  errors: Partial<Record<keyof ContactInput, string>>;
  codes: Partial<Record<keyof ContactInput, ContactErrorCode>>;
}

export function validateContactInput(input: Partial<ContactInput>): ContactValidationResult {
  const errors: ContactValidationResult["errors"] = {};
  const codes: ContactValidationResult["codes"] = {};

  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const subject = input.subject?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  if (!name) { errors.name = "Full name is required."; codes.name = "required"; }
  else if (name.length > MAX_NAME) { errors.name = `Name must be ${MAX_NAME} characters or fewer.`; codes.name = "tooLong"; }

  if (!email) { errors.email = "Email address is required."; codes.email = "required"; }
  else if (!EMAIL_RE.test(email)) { errors.email = "Enter a valid email address."; codes.email = "invalid"; }

  if (phone && phone.length > MAX_PHONE) { errors.phone = `Phone must be ${MAX_PHONE} characters or fewer.`; codes.phone = "tooLong"; }

  if (!subject) { errors.subject = "Subject is required."; codes.subject = "required"; }
  else if (subject.length > MAX_SUBJECT) { errors.subject = `Subject must be ${MAX_SUBJECT} characters or fewer.`; codes.subject = "tooLong"; }

  if (!category) { errors.category = "Please select a category."; codes.category = "required"; }
  else if (!CONTACT_CATEGORIES.includes(category as ContactCategory)) { errors.category = "Invalid category."; codes.category = "invalid"; }

  if (!message) { errors.message = "Message is required."; codes.message = "required"; }
  else if (message.length > MAX_MESSAGE) { errors.message = `Message must be ${MAX_MESSAGE} characters or fewer.`; codes.message = "tooLong"; }

  return { valid: Object.keys(errors).length === 0, errors, codes };
}
