import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';

export default getRequestConfig(async () => {
  // For public (locale-prefixed) routes, middleware.ts resolves the locale
  // from the URL and passes it via this header. Admin/auth routes are outside
  // the locale-prefixed tree — no header is set there, so we fall back to the
  // ptec_locale cookie exactly as before locale routing was introduced.
  const headerLocale = (await headers()).get('x-locale');
  let locale: string;
  if (headerLocale === 'en' || headerLocale === 'km') {
    locale = headerLocale;
  } else {
    const cookieLocale = (await cookies()).get('ptec_locale')?.value;
    locale = cookieLocale === 'km' ? 'km' : 'en';
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    timeZone: 'Asia/Phnom_Penh',
  };
});
