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
}

export function validateContactInput(input: Partial<ContactInput>): ContactValidationResult {
  const errors: ContactValidationResult["errors"] = {};

  const name = input.name?.trim() ?? "";
  const email = input.email?.trim() ?? "";
  const phone = input.phone?.trim() ?? "";
  const subject = input.subject?.trim() ?? "";
  const category = input.category?.trim() ?? "";
  const message = input.message?.trim() ?? "";

  if (!name) errors.name = "Full name is required.";
  else if (name.length > MAX_NAME) errors.name = `Name must be ${MAX_NAME} characters or fewer.`;

  if (!email) errors.email = "Email address is required.";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";

  if (phone && phone.length > MAX_PHONE) errors.phone = `Phone must be ${MAX_PHONE} characters or fewer.`;

  if (!subject) errors.subject = "Subject is required.";
  else if (subject.length > MAX_SUBJECT) errors.subject = `Subject must be ${MAX_SUBJECT} characters or fewer.`;

  if (!category) errors.category = "Please select a category.";
  else if (!CONTACT_CATEGORIES.includes(category as ContactCategory)) errors.category = "Invalid category.";

  if (!message) errors.message = "Message is required.";
  else if (message.length > MAX_MESSAGE) errors.message = `Message must be ${MAX_MESSAGE} characters or fewer.`;

  return { valid: Object.keys(errors).length === 0, errors };
}
