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

  // Frontend-specific overrides for React patterns
  {
    files: ["src/frontend/**/*.tsx", "src/frontend/**/*.ts"],
    rules: {
      // React event handlers often return void from arrow functions
      "@typescript-eslint/no-confusing-void-expression": "off",
      // React onClick handlers are commonly async
      "@typescript-eslint/no-misused-promises": ["error", {
        checksVoidReturn: {
          attributes: false,
        },
      }],
      // useEffect with async functions is a common React pattern
      "@typescript-eslint/no-floating-promises": "off",
      // Template literals with numbers are common in React
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
      }],
    },
  },

  // Scripts directory - utility scripts have different requirements
  {
    files: ["scripts/**/*.ts"],
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
      }],
      "@typescript-eslint/use-unknown-in-catch-callback-variable": "off",
    },
  },

  // Test files - relaxed rules for test patterns
  {
    files: ["tests/**/*.ts", "tests/**/*.tsx"],
    linterOptions: {
      // Tests may have eslint-disable comments that become unused after rule relaxation
      reportUnusedDisableDirectives: "off",
    },
    rules: {
      // Empty functions are common in test mocks
      "@typescript-eslint/no-empty-function": "off",
      // Unnecessary conditionals are often intentional in tests to verify logic
      "@typescript-eslint/no-unnecessary-condition": "off",
      // Template literals with numbers are common in test data
      "@typescript-eslint/restrict-template-expressions": ["error", {
        allowNumber: true,
      }],
      // Async functions without await are sometimes used for Promise wrapping
      "@typescript-eslint/require-await": "off",
      // Unused vars in tests are sometimes used for destructuring or prefixed with _
      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      }],
      // Allow any in test type assertions
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      // Console logs are useful in tests for debugging
      "no-console": "off",
    },
  },
];