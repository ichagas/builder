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
    // T018/T031: token lint. Flags raw Tailwind palette color classes and
    // hex color literals everywhere except the design token layer itself
    // (src/design/**), where such literals are expected/authoritative.
    // ERROR mode (T031): the colors-to-tokens codemod (T030/T031) has
    // mapped every raw class in src/components/** and src/pages/**, the
    // rule's own object-literal-value/template-literal-expression blind
    // spots are closed, and every remaining raw hex is either tokenized
    // (src/design/tokens.css's --ide-* group) or carries an inline
    // eslint-disable with a reason (Canvas 2D/D3 rendering contexts that
    // can't resolve CSS custom properties, PNG/PDF export snapshots that
    // must stay a fixed color regardless of app theme, PowerPoint's own
    // OOXML theme colors, and a Recharts attribute-selector false positive).
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/design/**"],
    plugins: {
      "token-lint": tokenLint,
    },
    rules: {
      "token-lint/no-raw-tailwind-colors": "error",
    },
  },
);
