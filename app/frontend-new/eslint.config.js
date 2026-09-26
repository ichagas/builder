import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import tokenLint from "./eslint-rules/no-raw-tailwind-colors.js";

export default tseslint.config(
  { ignores: ["node_modules", "dist", "build", "coverage", "*.min.js"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "quotes": ["warn", "double", { "avoidEscape": true, "allowTemplateLiterals": false }],
    },
  },
  {
    // T018: token lint. Flags raw Tailwind palette color classes and hex
    // color literals everywhere except the design token layer itself
    // (src/design/**), where such literals are expected/authoritative.
    // WARN mode now; T031 switches this to "error" once the codemod lands.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/design/**"],
    plugins: {
      "token-lint": tokenLint,
    },
    rules: {
      "token-lint/no-raw-tailwind-colors": "warn",
    },
  },
);
