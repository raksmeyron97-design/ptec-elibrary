import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware Link/router/redirect/usePathname for PUBLIC routes only.
// Never use these for /admin or /auth targets — those live outside the
// locale-prefixed route tree and would get an incorrect /km prefix.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
