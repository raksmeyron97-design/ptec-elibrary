"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/core/Button";
import { useTranslations } from "next-intl";

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMsg("");
    
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/auth/reset-password`,
    });
    
    if (error) {
      setError(error.message);
    } else {
      setMsg(t('checkEmailForReset'));
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg-body px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-divider bg-bg-surface p-8 shadow-sm">
        <h1 className="mb-2 text-2xl font-bold text-text-heading">{t('resetPasswordTitle')}</h1>
        <p className="mb-6 text-sm text-text-muted">{t('resetPasswordSubtitle')}</p>
        
        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {msg && <div className="mb-4 rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{msg}</div>}
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-text-body">{t('emailLabel')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder={t('emailPlaceholder')}
              className="h-11 w-full rounded-xl border border-divider bg-bg-body px-3 text-sm outline-none transition focus:border-brand"
            />
          </div>
          <Button type="submit" className="w-full h-11 rounded-xl" disabled={loading}>
            {loading ? t('sending') : t('sendResetLink')}
          </Button>
        </form>
        
        <div className="mt-6 text-center text-sm">
          <Link href="/auth/login" className="font-semibold text-brand hover:underline">
            {t('backToLogin')}
          </Link>
        </div>
      </div>
    </div>
  );
}
