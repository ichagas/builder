import { describe, it } from "vitest";
import { RuleTester } from "eslint";
import { noRawTailwindColorsRule } from "../no-raw-tailwind-colors.js";

// ESLint's RuleTester registers its own `describe`/`it` when run under a
// framework that exposes them globally (Vitest does, via `globals: true` in
// vitest.config.ts), and throws (rather than silently reporting nothing) on
// any mismatch — so a failing case here fails the Vitest run too.
const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
    parserOptions: {
      ecmaFeatures: { jsx: true },
    },
  },
});

describe("no-raw-tailwind-colors", () => {
  ruleTester.run("no-raw-tailwind-colors", noRawTailwindColorsRule, {
    valid: [
      // Design-token-driven className — no raw palette classes.
      `const el = <div className="bg-surface text-ink border-hairline" />;`,
      // Structural / non-color utility classes are fine.
      `const el = <div className="flex items-center gap-2 p-4 rounded-md" />;`,
      // Non-palette color keywords aren't flagged (no shade, not a "raw palette" concern).
      `const el = <div className="bg-white text-black border-transparent" />;`,
      // cn() with only structural / token classes.
      `const el = cn("flex", isActive && "bg-surface-active", { "text-ink": true });`,
      // style with a var/expression, not a literal hex.
      `const el = <div style={{ color: someToken }} />;`,
      // design token source files are exempt at the config level (see
      // eslint.config.js `ignores`), not inside the rule itself — the rule
      // has no file-path awareness, so this case only documents intent.
    ],
    invalid: [
      {
        code: `const el = <div className="bg-red-500" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-red-500" } }],
      },
      {
        code: `const el = <div className="text-gray-100 p-4" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "text-gray-100" } }],
      },
      {
        code: `const el = <div className="hover:border-slate-200" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "hover:border-slate-200" } }],
      },
      {
        code: `const el = <div className="dark:bg-blue-500/50" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "dark:bg-blue-500/50" } }],
      },
      {
        code: `const el = <div className={\`bg-red-500 \${extra}\`} />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-red-500" } }],
      },
      {
        code: `const el = cn("flex", isActive && "bg-red-500");`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-red-500" } }],
      },
      {
        code: `const el = clsx({ "text-red-500": hasError });`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "text-red-500" } }],
      },
      {
        code: `const el = cn(["p-2", "bg-emerald-600"]);`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-emerald-600" } }],
      },
      {
        code: `const el = <div className="p-2" style={{ color: "#ff0000" }} />;`,
        errors: [{ messageId: "rawHexColor", data: { hex: "#ff0000" } }],
      },
      {
        code: `const el = <div className="#abc" />;`,
        errors: [{ messageId: "rawHexColor", data: { hex: "#abc" } }],
      },
    ],
  });

  // A no-op `it` so this file also shows up as a normal Vitest test in
  // reporters that don't surface RuleTester's own describe/it blocks.
  it("registers RuleTester cases via the describe block above", () => {
    // Intentionally empty: assertions happen inside ruleTester.run() above.
  });
});
