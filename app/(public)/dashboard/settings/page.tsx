/* eslint-disable @typescript-eslint/no-unused-vars */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";
import PushSubscribeButton from "@/components/ui/notifications/PushSubscribeButton";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login?callbackUrl=/dashboard/settings");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, avatar_url")
    .eq("id", user.id)
    .single();

  const t = await getTranslations("nav");
  // using generic translations for now as they might not be added yet, but using english fallbacks in the client

  const userInfo = {
    id: user.id,
    email: user.email || "",
    full_name: profile?.full_name || user.user_metadata?.full_name || null,
    avatar_url: profile?.avatar_url || user.user_metadata?.avatar_url || null,
  };

  const translations: Record<string, string> = {
    // Sections
    profileSettings: "Profile",
    profileDesc: "Update your personal details and how your account appears.",
    passwordSettings: "Security",
    securityDesc: "Choose a strong password to keep your account safe.",

    // Side navigation
    profileTab: "Profile",
    profileTabSub: "Name & avatar",
    securityTab: "Security",
    securityTabSub: "Password",

    // Avatar
    avatarHelp1: "Profile picture",
    avatarHelp2: "JPG or PNG, up to 5MB.",
    avatarAlt: "Profile picture",
    changePhoto: "Change photo",
    reset: "Reset",
    fileTooLarge: "That image is over 5MB. Choose a smaller file.",

    // Profile fields
    email: "Email address",
    emailLocked: "Your email can’t be changed here.",
    fullName: "Full name",
    fullNamePlaceholder: "Your full name",
    saveChanges: "Save changes",
    saving: "Saving…",
    profileUpdated: "Profile updated successfully.",

    // Password fields
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    passwordStrength: "Password strength",
    strengthWeak: "Weak",
    strengthFair: "Fair",
    strengthGood: "Good",
    strengthStrong: "Strong",
    reqLength: "At least 8 characters",
    reqUpper: "One uppercase letter",
    reqNumber: "One number",
    reqSymbol: "One symbol",
    passwordsMatch: "Passwords match",
    passwordsNoMatch: "Passwords don’t match",
    updatePassword: "Update password",
    updating: "Updating…",
    passwordUpdated: "Password updated successfully.",
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      {/* Page header */}
      <header className="mb-8 sm:mb-10">
        <p className="text-xs font-medium text-text-muted mb-2">
          {translations.breadcrumb || "Dashboard"} <span className="px-1.5 text-divider">/</span>{" "}
          <span className="text-text-body">Settings</span>
        </p>
        <div className="flex items-start gap-4">
          <span className="grid place-items-center h-11 w-11 rounded-xl bg-bg-surface border border-divider text-brand shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
          </span>
          <div>
            <h1 className="text-2xl sm:text-3xl font-khmer-serif font-bold text-text-heading leading-tight">Settings</h1>
            <p className="text-sm sm:text-base text-text-muted mt-1">
              Manage your account preferences and security.
            </p>
          </div>
        </div>
      </header>

      <SettingsClient user={userInfo} t={translations} />

      {/* Notifications */}
      <div className="mt-8 rounded-2xl border border-divider bg-bg-surface p-5 shadow-sm">
        <h2 className="mb-1 text-[15px] font-bold text-text-heading">Push Notifications</h2>
        <p className="mb-4 text-[12.5px] text-text-muted">
          Receive browser/device notifications when new books or announcements are posted.
        </p>
        <PushSubscribeButton />
      </div>
    </div>
  );
}