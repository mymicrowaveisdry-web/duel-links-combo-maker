import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores([
    "dist/",
    "coverage/",
    "test-results/",
    "playwright-report/",
    ".ai/",
    "data/",
  ]),
  { files: ["**/*.{ts,tsx,mjs}"], extends: [js.configs.recommended] },
  { files: ["**/*.{ts,tsx}"], extends: [tseslint.configs.recommended] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
]);
