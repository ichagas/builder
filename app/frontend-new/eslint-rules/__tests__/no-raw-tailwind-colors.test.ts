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

      // WP-F2b fix round 2, item 1 (same-token text-X/bg-X): the
      // established "-soft" pairing is fine — different token, not a
      // collision.
      `const el = <div className="text-ok bg-ok-soft" />;`,
      // A bg with its own opacity modifier is fine even with the same base
      // color as the text (this is the DeltaChip/TypeChip pattern).
      `const el = <div className="text-warn bg-warn/10" />;`,
      // Different colors entirely.
      `const el = <div className="text-primary-foreground bg-primary" />;`,
      // Mutually-exclusive && branches (one active state at a time) must
      // NOT be merged across strings — each string is checked on its own.
      `const el = cn("border-2", isActive && "bg-primary text-primary-foreground", isDone && "bg-primary/20 text-primary");`,
      // Non-legend tokens (surface/ink/line/etc.) pairing with themselves
      // isn't this bug — restricted to the fixed color-group list.
      `const el = <div className="border-line text-line" />;`,

      // WP-F2b fix round 2, item 3: an arbitrary value wrapping a design
      // token (`var(--…)`) is the *correct* way to reach a CSS variable
      // from a Tailwind arbitrary-value utility and must never be flagged,
      // for any of the four functional color notations.
      `const el = <div className="bg-[var(--primary)]" />;`,
      `const el = <div className="text-[hsl(var(--primary-h),var(--primary-s),var(--primary-l))]" />;`,
      `const el = <div className="border-[rgb(var(--line-rgb))]" />;`,
      // A non-color arbitrary value (e.g. an arbitrary width) is unaffected.
      `const el = <div className="w-[120%] h-[3px]" />;`,
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
      // WP-F2b fix round 2, item 1: the actual reviewer-found bug
      // (DatabaseSchemaSelector.tsx's "External" badge) — bg-define with no
      // opacity modifier paired with text-define makes the text invisible
      // against its own background.
      {
        code: `const el = <span className="text-[10px] text-define bg-define dark:bg-define/30" />;`,
        errors: [{ messageId: "sameTokenTextBg", data: { pair: "bg-define / text-define" } }],
      },
      // Reversed order (text- before bg-) is caught the same way.
      {
        code: `const el = <div className="bg-warn text-warn" />;`,
        errors: [{ messageId: "sameTokenTextBg", data: { pair: "bg-warn / text-warn" } }],
      },
      // A dark: variant collides only with a dark: text of the same token —
      // the light-mode (unprefixed) text-cat-3 is a different variant and
      // doesn't collide with dark:bg-cat-3.
      {
        code: `const el = <div className="text-cat-3 dark:bg-cat-3 dark:text-cat-3" />;`,
        errors: [{ messageId: "sameTokenTextBg", data: { pair: "dark:bg-cat-3 / dark:text-cat-3" } }],
      },
      // Works through cn() and template literals too, not just a plain
      // className string.
      {
        code: "const el = cn(`p-2 bg-bad text-bad`);",
        errors: [{ messageId: "sameTokenTextBg", data: { pair: "bg-bad / text-bad" } }],
      },
      // WP-F2b fix round 2, item 3: Tailwind arbitrary-value color
      // utilities in the functional notations, mirroring the Landing.tsx
      // hits (`bg-[hsl(210,100%,50%)]`).
      {
        code: `const el = <div className="bg-[hsl(210,100%,50%)]" />;`,
        errors: [{ messageId: "rawArbitraryColor", data: { token: "bg-[hsl(210,100%,50%)]" } }],
      },
      {
        code: `const el = <div className="bg-[hsl(210,100%,50%)]/20" />;`,
        errors: [{ messageId: "rawArbitraryColor", data: { token: "bg-[hsl(210,100%,50%)]/20" } }],
      },
      {
        code: `const el = <div className="text-[rgb(0,122,204)]" />;`,
        errors: [{ messageId: "rawArbitraryColor", data: { token: "text-[rgb(0,122,204)]" } }],
      },
      {
        code: `const el = <div className="border-[rgba(0,0,0,.5)]" />;`,
        errors: [{ messageId: "rawArbitraryColor", data: { token: "border-[rgba(0,0,0,.5)]" } }],
      },
      {
        code: `const el = <div className="ring-[hsla(0,0%,0%,.5)]" />;`,
        errors: [{ messageId: "rawArbitraryColor", data: { token: "ring-[hsla(0,0%,0%,.5)]" } }],
      },
      // Works via cn() too, and a `dark:` variant prefix is preserved in
      // the reported token.
      {
        code: `const el = cn("dark:bg-[hsl(210,100%,50%)]");`,
        errors: [
          { messageId: "rawArbitraryColor", data: { token: "dark:bg-[hsl(210,100%,50%)]" } },
        ],
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
