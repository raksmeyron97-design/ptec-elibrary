"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/core/Button";
import { useTranslations } from "next-intl";

export default function ResetPasswordPage() {
  const t = useTranslations('auth');
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const supabase = createClient();
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");
    
    if (password.length < 8) {
      setError(t('errPasswordLength'));
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    
    if (error) {
      setError(error.message);
    } else {
      setMsg(t('passwordUpdated'));
      setTimeout(() => router.push("/auth/login"), 2000);
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-body px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-divider bg-bg-surface p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-text-heading">{t('newPasswordTitle')}</h1>
        <p className="mb-6 text-sm text-text-muted">{t('newPasswordSubtitle')}</p>
        
        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {msg && <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-body">{t('newPasswordLabel')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder={t('newPasswordPlaceholder')}
              className="h-11 w-full rounded-xl border border-divider bg-bg-body px-3 text-sm outline-none transition focus:border-brand"
            />
          </div>
          <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading}>
            {loading ? t('updating') : t('updatePassword')}
          </Button>
        </form>
      </div>
    </div>
  );
}
