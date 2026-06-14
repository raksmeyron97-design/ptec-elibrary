import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendored artifacts in public/ (Serwist service worker and
    // bundled PDF.js workers). These are build outputs, not hand-written source.
    "public/sw.js",
    "public/**/*.min.mjs",
    "public/pdf/**",
  ]),
  {
    // These rules flag patterns that are either intentional (dynamic Supabase
    // query-result rows) or working as-is in production (React effect/render
    // patterns). Keep them visible as warnings rather than blocking CI; they can
    // be tightened incrementally without a risky large-scale refactor.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
