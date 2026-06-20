"use client";

import { useState, useTransition } from "react";
import { updateProfile, updatePassword } from "@/app/actions/profile";
import Icon from "@/components/ui/core/Icon";

type SettingsClientProps = {
  user: {
    id: string;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
  };
  t: Record<string, string>;
};

export default function SettingsClient({ user, t }: SettingsClientProps) {
  const [profilePending, startProfileTransition] = useTransition();
  const [passwordPending, startPasswordTransition] = useTransition();
  
  const [profileMsg, setProfileMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  
  const [avatarPreview, setAvatarPreview] = useState<string | null>(user.avatar_url);
  const [avatarFailed, setAvatarFailed] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarPreview(URL.createObjectURL(file));
      setAvatarFailed(false);
    }
  };

  const onProfileSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileMsg(null);
    const formData = new FormData(e.currentTarget);
    
    startProfileTransition(async () => {
      const res = await updateProfile(formData);
      if (res?.error) {
        setProfileMsg({ type: "error", text: res.error });
      } else {
        setProfileMsg({ type: "success", text: t.profileUpdated || "Profile updated successfully." });
      }
    });
  };

  const onPasswordSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPasswordMsg(null);
    const form = e.currentTarget;
    const formData = new FormData(form);
    
    startPasswordTransition(async () => {
      const res = await updatePassword(formData);
      if (res?.error) {
        setPasswordMsg({ type: "error", text: res.error });
      } else {
        setPasswordMsg({ type: "success", text: t.passwordUpdated || "Password updated successfully." });
        form.reset();
      }
    });
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Profile Section */}
      <section className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-text-heading mb-6">{t.profileSettings || "Profile Settings"}</h2>
        
        <form onSubmit={onProfileSubmit} className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-paper border-2 border-divider shrink-0 group">
              {avatarPreview && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarPreview}
                  alt="Avatar"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-brand text-brand-contrast text-2xl font-bold">
                  {(user.full_name || user.email).charAt(0).toUpperCase()}
                </div>
              )}
              <label className="absolute inset-0 bg-slate-900/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                <Icon name="camera" className="text-white text-xl" />
                <input type="file" name="avatar" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              </label>
            </div>
            <div className="text-sm text-text-muted">
              <p className="font-semibold text-text-body mb-1">{t.avatarHelp1 || "Profile picture"}</p>
              <p>{t.avatarHelp2 || "Click the image to upload a new avatar. JPG or PNG, max 5MB."}</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">{t.email || "Email address"}</label>
              <input 
                type="email" 
                value={user.email} 
                disabled 
                className="w-full h-11 px-4 rounded-xl bg-paper border border-divider text-text-muted cursor-not-allowed focus:outline-none" 
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-body mb-1.5">{t.fullName || "Full name"}</label>
              <input 
                type="text" 
                name="full_name" 
                defaultValue={user.full_name || ""}
                placeholder={t.fullNamePlaceholder || "Your full name"}
                className="w-full h-11 px-4 rounded-xl bg-bg-surface border border-divider text-text-body focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all" 
              />
            </div>
          </div>

          {profileMsg && (
            <div className={`p-3 rounded-lg text-sm font-medium ${profileMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {profileMsg.text}
            </div>
          )}

          <button 
            type="submit" 
            disabled={profilePending}
            className="h-11 px-6 rounded-xl bg-brand text-brand-contrast font-semibold hover:bg-brand-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {profilePending ? t.saving || "Saving..." : t.saveChanges || "Save Changes"}
          </button>
        </form>
      </section>

      {/* Password Section */}
      <section className="bg-bg-surface border border-divider rounded-2xl p-6 sm:p-8 shadow-sm">
        <h2 className="text-xl font-bold text-text-heading mb-6">{t.passwordSettings || "Security"}</h2>
        
        <form onSubmit={onPasswordSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">{t.newPassword || "New password"}</label>
            <input 
              type="password" 
              name="password" 
              placeholder="••••••••"
              minLength={8}
              required
              className="w-full h-11 px-4 rounded-xl bg-bg-surface border border-divider text-text-body focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-text-body mb-1.5">{t.confirmPassword || "Confirm new password"}</label>
            <input 
              type="password" 
              name="confirmPassword" 
              placeholder="••••••••"
              minLength={8}
              required
              className="w-full h-11 px-4 rounded-xl bg-bg-surface border border-divider text-text-body focus:border-brand focus:ring-1 focus:ring-brand focus:outline-none transition-all" 
            />
          </div>

          {passwordMsg && (
            <div className={`p-3 rounded-lg text-sm font-medium ${passwordMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
              {passwordMsg.text}
            </div>
          )}

          <div className="pt-2">
            <button 
              type="submit" 
              disabled={passwordPending}
              className="h-11 px-6 rounded-xl bg-paper border border-divider text-text-body font-semibold hover:bg-divider/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {passwordPending ? t.updating || "Updating..." : t.updatePassword || "Update Password"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
