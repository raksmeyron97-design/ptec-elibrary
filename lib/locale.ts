import { cookies } from 'next/headers';

export async function getLocaleFromCookie(): Promise<'en' | 'km'> {
  const cookieStore = await cookies();
  const value = cookieStore.get('ptec_locale')?.value;
  return value === 'km' ? 'km' : 'en';
}
