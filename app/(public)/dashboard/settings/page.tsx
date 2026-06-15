/* eslint-disable @typescript-eslint/no-unused-vars */
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import SettingsClient from "./SettingsClient";
import { getTranslations } from "next-intl/server";

export const metadata = {
  title: "Settings",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

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

  const translations = {
    profileSettings: "Profile Settings",
    passwordSettings: "Security",
    avatarHelp1: "Profile picture",
    avatarHelp2: "Click the image to upload a new avatar. JPG or PNG, max 5MB.",
    email: "Email address",
    fullName: "Full name",
    fullNamePlaceholder: "Your full name",
    saveChanges: "Save Changes",
    saving: "Saving...",
    newPassword: "New password",
    confirmPassword: "Confirm new password",
    updatePassword: "Update Password",
    updating: "Updating...",
    profileUpdated: "Profile updated successfully.",
    passwordUpdated: "Password updated successfully.",
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-khmer-serif font-bold text-text-heading">Settings</h1>
        <p className="text-sm sm:text-base text-text-muted mt-1">Manage your account preferences and security.</p>
      </div>
      <SettingsClient user={userInfo} t={translations} />
    </div>
  );
}
