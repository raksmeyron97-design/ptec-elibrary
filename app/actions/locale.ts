'use server';

import { cookies } from 'next/headers';

export async function setLocaleCookie(locale: 'en' | 'km') {
  const store = await cookies();
  store.set('ptec_locale', locale, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
  });
}
