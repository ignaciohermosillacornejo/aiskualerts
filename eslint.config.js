// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import security from "eslint-plugin-security";

export default [
  // Global ignores - files/directories to skip
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", ".github/**"],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // Strict TypeScript rules
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  // Security plugin rules
  security.configs.recommended,

  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
    },
  },
];