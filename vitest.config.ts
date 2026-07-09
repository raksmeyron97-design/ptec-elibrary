import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    // Playwright specs live in e2e/ and must not be collected by vitest —
    // they run under `playwright test`, not the unit runner.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    alias: {
      '@': path.resolve(__dirname, './'),
      // Next.js aliases the bare "server-only" import to an internal no-op
      // for server bundles (next/dist/compiled/server-only/empty.js) — Vite
      // doesn't know that alias, so tests that import a server-only module
      // (lib/gmail.ts, lib/permissions.ts, ...) need it mapped explicitly.
      'server-only': path.resolve(__dirname, './vitest.server-only-shim.ts'),
    },
  },
});
