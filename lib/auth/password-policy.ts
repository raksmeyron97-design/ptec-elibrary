/**
 * The password rules shown to the user during signup, kept in lockstep with
 * what Supabase Auth actually enforces (`supabase/config.toml`):
 *
 *   minimum_password_length = 8
 *   password_requirements   = "letters_digits"   // one letter + one digit
 *
 * "letters_digits" does NOT distinguish upper/lower case — only that the
 * password contains at least one letter (either case) and at least one
 * digit. Do not add an uppercase/lowercase requirement here unless the
 * Supabase config is changed to "lower_upper_letters_digits" first; the UI
 * must never claim a rule the backend does not enforce.
 */
export const PASSWORD_MIN_LENGTH = 8;

export type PasswordRequirementId = "length" | "letter" | "number";

export interface PasswordRequirement {
  id: PasswordRequirementId;
  met: boolean;
}

export function passwordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: "length", met: password.length >= PASSWORD_MIN_LENGTH },
    { id: "letter", met: /[a-zA-Z]/.test(password) },
    { id: "number", met: /[0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return passwordRequirements(password).every((r) => r.met);
}
