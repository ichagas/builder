import { describe, it, expect } from "vitest";
import { RuleTester } from "eslint";
import { noRawTailwindColorsRule } from "../no-raw-tailwind-colors.js";
import eslintConfig from "../../eslint.config.js";

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

      // T031 (WP-F2b): a non-class string property value (no colon-shaped
      // class regex match) is never flagged — sanity check that the new
      // whole-file Property visitor (added for the class-lookup-table case)
      // doesn't over-fire on ordinary object literals.
      `const el = <div className="p-2" />; const copy = { label: "Send message", id: "not-a-class-string" };`,
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
      // `md:` (responsive breakpoint variant), distinct from `hover:`/`dark:`.
      {
        code: `const el = <div className="md:bg-red-500" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "md:bg-red-500" } }],
      },
      // Plain numeric opacity modifier (`/50`) with no other variant.
      {
        code: `const el = <div className="text-red-500/50" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "text-red-500/50" } }],
      },
      // Arbitrary-value opacity modifier (`/[0.12]`).
      {
        code: `const el = <div className="bg-emerald-600/[0.12]" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-emerald-600/[0.12]" } }],
      },
      // Arbitrary hex value (`bg-[#fff]`) — not a palette-shade token, but the
      // embedded hex literal is still caught by the hex-literal check.
      {
        code: `const el = <div className="bg-[#fff]" />;`,
        errors: [{ messageId: "rawHexColor", data: { hex: "#fff" } }],
      },
      // Hex literal inside a template literal's static quasi.
      {
        code: `const el = <div style={{ color: \`#123456\` }} />;`,
        errors: [{ messageId: "rawHexColor", data: { hex: "#123456" } }],
      },
      // Stacked variants (`hover:dark:`) combined with an opacity modifier.
      {
        code: `const el = <div className="hover:dark:bg-blue-500/50" />;`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "hover:dark:bg-blue-500/50" } }],
      },
      // T031 (WP-F2b): object-literal property VALUES used as a status/type
      // -> classes lookup table, e.g. `const typeColors = { EPIC:
      // "bg-purple-500/10 ...", ... }`, used later via `className={MAP[key]}`
      // — not a className value or a class-helper-call argument at the
      // point the string appears, so this needs its own whole-file check.
      {
        code: `const typeColors = { EPIC: "bg-purple-500/10 text-purple-700 border-purple-500/20" };`,
        errors: [
          { messageId: "rawTailwindColor", data: { token: "bg-purple-500/10" } },
          { messageId: "rawTailwindColor", data: { token: "text-purple-700" } },
          { messageId: "rawTailwindColor", data: { token: "border-purple-500/20" } },
        ],
      },
      // Same shape with a quoted key.
      {
        code: `const map = { "IN_PROGRESS": "bg-amber-500" };`,
        errors: [{ messageId: "rawTailwindColor", data: { token: "bg-amber-500" } }],
      },
      // T031 (WP-F2b): a conditional expression living inside a
      // className={`...${...}`} template-literal interpolation, e.g.
      // `` className={`p-3 ${cond ? "border-green-500/50 bg-green-500/10" :
      // "bg-muted/50"}`} `` — previously only the static quasi text was
      // checked, so the ternary's branches (real, rendered class strings)
      // were invisible.
      {
        code: "const el = <div className={`p-3 ${cond ? \"border-green-500/50 bg-green-500/10\" : \"bg-muted/50\"}`} />;",
        errors: [
          { messageId: "rawTailwindColor", data: { token: "border-green-500/50" } },
          { messageId: "rawTailwindColor", data: { token: "bg-green-500/10" } },
        ],
      },
      // T031 (WP-F2b): a style={{}} color literal must be reported exactly
      // once even though it is now reachable both via the JSXAttribute
      // "style" handling and the whole-file Property visitor.
      {
        code: `const el = <div style={{ color: "#ff0000" }} />;`,
        errors: [{ messageId: "rawHexColor", data: { hex: "#ff0000" } }],
      },
    ],
  });

  // A no-op `it` so this file also shows up as a normal Vitest test in
  // reporters that don't surface RuleTester's own describe/it blocks.
  it("registers RuleTester cases via the describe block above", () => {
    // Intentionally empty: assertions happen inside ruleTester.run() above.
  });

  it("exempts src/design/** from token-lint in the real eslint.config.js", () => {
    // RuleTester exercises the rule in isolation and has no file-path
    // awareness (the rule itself never inspects the filename), so the
    // src/design/** exemption is a config-level concern — verify it against
    // the actual flat config the project lints with, not a re-implementation.
    const tokenLintConfig = eslintConfig.find(
      (entry) =>
        Array.isArray(entry.files) &&
        entry.files.includes("src/**/*.{ts,tsx}") &&
        entry.rules &&
        Object.prototype.hasOwnProperty.call(entry.rules, "token-lint/no-raw-tailwind-colors"),
    );

    expect(tokenLintConfig).toBeDefined();
    expect(tokenLintConfig.ignores).toContain("src/design/**");
    // T031 (WP-F2b): switched from "warn" to "error" once the codemod
    // (T030/T031) and this rule's blind-spot fixes closed every real
    // violation.
    expect(tokenLintConfig.rules["token-lint/no-raw-tailwind-colors"]).toBe("error");
  });
});
