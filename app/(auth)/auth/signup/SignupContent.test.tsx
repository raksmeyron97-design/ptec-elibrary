import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";

import enMessages from "@/messages/en.json";

// ── Supabase client mock ────────────────────────────────────────────────────
const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithOAuth: vi.fn(),
  resend: vi.fn(),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth }),
}));

// ── Turnstile mock ───────────────────────────────────────────────────────────
// Auto-succeeds by default (most tests care about the form, not the widget);
// individual tests flip `turnstileState.autoSucceed` to exercise the
// captcha-required path.
const turnstileState = vi.hoisted(() => ({ autoSucceed: true }));
vi.mock("@marsidev/react-turnstile", async () => {
  const React = await import("react");
  const Turnstile = React.forwardRef<unknown, {
    onWidgetLoad?: (id: string) => void;
    onSuccess?: (token: string) => void;
  }>(function MockTurnstile(props, ref) {
    React.useImperativeHandle(ref, () => ({
      reset: vi.fn(),
      execute: vi.fn(),
      remove: vi.fn(),
      render: vi.fn(),
      getResponse: vi.fn(),
      getResponsePromise: vi.fn(),
      isExpired: vi.fn(),
    }));
    React.useEffect(() => {
      props.onWidgetLoad?.("mock-widget");
      if (turnstileState.autoSucceed) props.onSuccess?.("test-captcha-token");
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return React.createElement("div", { "data-testid": "turnstile-mock" });
  });
  return { Turnstile };
});

import SignupContent from "./SignupContent";

function renderSignup() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SignupContent />
    </NextIntlClientProvider> as ReactNode,
  );
}

async function fillValidForm() {
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Sok Dara" } });
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "sok.dara@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcd1234" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "abcd1234" } });
}

describe("SignupContent — rendering", () => {
  beforeEach(() => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockReset();
    auth.signInWithOAuth.mockReset();
    auth.resend.mockReset();
  });

  it("renders the signup form with all primary elements", () => {
    renderSignup();
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Email address")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByLabelText("Confirm password")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toBeInTheDocument();
  });

  it("does not disable the submit button just because the captcha has not resolved yet", () => {
    turnstileState.autoSucceed = false;
    renderSignup();
    expect(screen.getByRole("button", { name: "Create account" })).not.toBeDisabled();
  });
});

describe("SignupContent — validation", () => {
  beforeEach(() => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockReset();
  });

  it("shows no errors before any interaction", () => {
    renderSignup();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("validates full name on blur", () => {
    renderSignup();
    const input = screen.getByLabelText("Full name");
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(screen.getByText("Full name is required.")).toBeInTheDocument();
  });

  it("validates email format on blur", () => {
    renderSignup();
    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();
  });

  it("clears the email error once the value becomes valid", () => {
    renderSignup();
    const input = screen.getByLabelText("Email address");
    fireEvent.change(input, { target: { value: "not-an-email" } });
    fireEvent.blur(input);
    expect(screen.getByText("Please enter a valid email address.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "ok@example.com" } });
    expect(screen.queryByText("Please enter a valid email address.")).not.toBeInTheDocument();
  });

  it("flags a too-short password on blur", () => {
    renderSignup();
    const input = screen.getByLabelText("Password");
    fireEvent.change(input, { target: { value: "abc1" } });
    fireEvent.blur(input);
    expect(screen.getByText("Password must be at least 8 characters.")).toBeInTheDocument();
  });

  it("flags a password missing a digit even at 8+ characters (letters_digits policy)", () => {
    renderSignup();
    const input = screen.getByLabelText("Password");
    fireEvent.change(input, { target: { value: "abcdefgh" } });
    fireEvent.blur(input);
    expect(screen.getByText("Password must include at least one letter and one number.")).toBeInTheDocument();
  });

  it("shows a live mismatch as soon as both password fields have content — no blur needed", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcd1234" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "abcd9999" } });
    expect(screen.getByText("Passwords do not match.")).toBeInTheDocument();
  });

  it("shows a positive match indicator once both fields agree", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcd1234" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "abcd1234" } });
    expect(screen.getByText("Passwords match")).toBeInTheDocument();
  });

  it("does not validate the confirm field while it is still empty", () => {
    renderSignup();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcd1234" } });
    expect(screen.queryByText("Passwords do not match.")).not.toBeInTheDocument();
    expect(screen.queryByText("Passwords match")).not.toBeInTheDocument();
  });
});

describe("SignupContent — password requirements panel", () => {
  it("appears once the user starts typing and reflects only backend-enforced rules", () => {
    renderSignup();
    expect(screen.queryByText("Password must contain:")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "a" } });
    expect(screen.getByText("Password must contain:")).toBeInTheDocument();
    expect(screen.getByText("At least 8 characters")).toBeInTheDocument();
    expect(screen.getByText("One letter")).toBeInTheDocument();
    expect(screen.getByText("One number")).toBeInTheDocument();
    // No separate uppercase/lowercase requirement — see password-policy.ts.
    expect(screen.queryByText(/uppercase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lowercase/i)).not.toBeInTheDocument();
  });
});

describe("SignupContent — interaction", () => {
  beforeEach(() => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockReset();
    auth.signInWithOAuth.mockReset();
  });

  it("toggles password visibility", () => {
    renderSignup();
    const input = screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    // Both the password and confirm-password fields start with the same
    // "Show password" label — the first toggle in document order is the
    // primary password field's.
    fireEvent.click(screen.getAllByRole("button", { name: "Show password" })[0]);
    expect(input.type).toBe("text");
    fireEvent.click(screen.getAllByRole("button", { name: "Hide password" })[0]);
    expect(input.type).toBe("password");
  });

  it("shows a loading state while Google sign-in is pending", async () => {
    let resolveOAuth: (v: { error: null }) => void = () => {};
    auth.signInWithOAuth.mockReturnValue(new Promise((resolve) => { resolveOAuth = resolve; }));
    renderSignup();
    fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
    expect(await screen.findByRole("button", { name: "Redirecting…" })).toBeInTheDocument();
    resolveOAuth({ error: null });
  });

  it("shows a loading state while signup is submitting", async () => {
    let resolveSignUp: (v: { error: null }) => void = () => {};
    auth.signUp.mockReturnValue(new Promise((resolve) => { resolveSignUp = resolve; }));
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("button", { name: "Creating account…" })).toBeInTheDocument();
    resolveSignUp({ error: null });
  });
});

describe("SignupContent — security", () => {
  beforeEach(() => {
    auth.signUp.mockReset();
  });

  it("blocks submission and explains why when the captcha has not been solved", async () => {
    turnstileState.autoSucceed = false;
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("Please complete the verification below to continue.")).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("blocks a reserved admin-domain email client-side (server trigger from migration 0068 remains authoritative)", async () => {
    turnstileState.autoSucceed = true;
    renderSignup();
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Staff Member" } });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "someone@ptec.edu.kh" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "abcd1234" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "abcd1234" } });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/reserved for library staff/i)).toBeInTheDocument();
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("maps a server 'already registered' error to a friendly message with a sign-in recovery link", async () => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockResolvedValue({ error: { message: "User already registered" } });
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText(/account with this email already exists/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in instead" })).toHaveAttribute("href", "/auth/login");
  });

  it("never leaks a raw backend error message", async () => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockResolvedValue({ error: { message: 'relation "profiles" does not exist' } });
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByText("An error occurred. Please try again.")).toBeInTheDocument();
    expect(screen.queryByText(/relation/i)).not.toBeInTheDocument();
  });
});

describe("SignupContent — success / email verification", () => {
  beforeEach(() => {
    turnstileState.autoSucceed = true;
    auth.signUp.mockReset();
    auth.resend.mockReset();
  });

  it("shows the dedicated verification screen with the emphasized email after a successful signup", async () => {
    auth.signUp.mockResolvedValue({ error: null });
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByText("sok.dara@example.com")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to login" })).toHaveAttribute("href", "/auth/login");
  });

  it("lets the user resend the verification email", async () => {
    auth.signUp.mockResolvedValue({ error: null });
    auth.resend.mockResolvedValue({ error: null });
    renderSignup();
    await fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));
    await screen.findByRole("heading", { name: "Check your email" });

    fireEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    await waitFor(() => expect(auth.resend).toHaveBeenCalledWith(
      expect.objectContaining({ type: "signup", email: "sok.dara@example.com" }),
    ));
    expect(await screen.findByText("Verification email sent")).toBeInTheDocument();
  });
});
