import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "tailwindcss";
import tailwindConfig from "../../../tailwind.config";

/**
 * Guard for the T020 follow-up defect (WP-F2c): `--muted`, `--primary`,
 * `--primary-foreground` and `--radius` used to be defined in BOTH
 * tokens.css (Blueprint hex, the source of truth per
 * contracts/design-system.md §1) and index.css's shadcn `@layer base` block
 * (a computed HSL triplet, §1.1). Because index.css imports after
 * tokens.css, its triplet silently won, and `var(--muted)`/`var(--primary)`
 * (used as raw CSS colors, e.g. `--chart-1: var(--primary)` in tokens.css
 * itself) resolved to a bare "H S% L%" string, an invalid CSS color. See the
 * commit history around this file and tailwind.config.ts for the fix: the
 * four vars are now defined exactly once (tokens.css only), and
 * tailwind.config.ts's `muted`/`primary` colors read the Blueprint `-rgb`
 * tokens directly instead of `hsl(var(--muted))`/`hsl(var(--primary))`.
 */

function extractCustomPropertyNames(css: string): Set<string> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const names = new Set<string>();
  // Matches a custom-property *declaration* (name followed by `:`), not a
  // `var(--x)` *reference* — declarations are always `--name:` at the start
  // of a statement (optionally indented), references are always inside
  // `var(...)`.
  const re = /(?:^|[;{\s])(--[a-zA-Z0-9-]+)\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutComments))) {
    names.add(match[1]);
  }
  return names;
}

describe("no CSS custom property is defined in both tokens.css and index.css", () => {
  it("has no overlap between the two files' declared custom properties", () => {
    const tokensCss = readFileSync(resolve(__dirname, "../tokens.css"), "utf8");
    const indexCss = readFileSync(resolve(__dirname, "../../index.css"), "utf8");

    const tokensNames = extractCustomPropertyNames(tokensCss);
    const indexNames = extractCustomPropertyNames(indexCss);

    const overlap = [...tokensNames].filter((name) => indexNames.has(name)).sort();

    expect(overlap).toEqual([]);
  });
});

describe("shadcn utility classes read the Blueprint rgb tokens, not a re-pointed HSL var", () => {
  it("compiles text-muted-foreground / bg-muted / bg-primary / text-primary-foreground / bg-primary/10 to rgb(var(--x-rgb) ...)", async () => {
    const config = {
      ...tailwindConfig,
      content: [
        {
          raw: '<div class="text-muted-foreground bg-muted bg-primary text-primary-foreground bg-primary/10 bg-muted/50 rounded-lg rounded-md rounded-sm"></div>',
          extension: "html" as const,
        },
      ],
      corePlugins: { preflight: false },
    };

    const result = await postcss([tailwindcss(config)]).process("@tailwind utilities;", { from: undefined });
    const css = result.css;

    const get = (selector: string) => {
      const re = new RegExp(`\\.${selector.replace(/[.:/]/g, (c) => `\\${c}`)}\\s*\\{[^}]*\\}`);
      const m = css.match(re);
      expect(m, `expected a rule for .${selector} in generated CSS`).toBeTruthy();
      return (m as RegExpMatchArray)[0];
    };

    expect(get("text-muted-foreground")).toContain("rgb(var(--muted-rgb)");
    expect(get("bg-muted")).toContain("rgb(var(--surface-2-rgb)");
    expect(get("bg-primary")).toContain("rgb(var(--primary-rgb)");
    expect(get("text-primary-foreground")).toContain("rgb(var(--primary-foreground-rgb)");
    expect(get("bg-primary\\/10")).toContain("rgb(var(--primary-rgb)");
    expect(get("bg-muted\\/50")).toContain("rgb(var(--surface-2-rgb)");

    // The old, colliding shadcn HSL vars must not appear anywhere in the
    // generated output for these utilities.
    expect(css).not.toMatch(/hsl\(var\(--muted\)\)/);
    expect(css).not.toMatch(/hsl\(var\(--primary\)\)/);
    expect(css).not.toMatch(/hsl\(var\(--primary-foreground\)\)/);

    // --radius: shadcn's rounded-lg/md/sm must still calc from the single
    // (tokens.css) --radius definition.
    expect(get("rounded-lg")).toContain("var(--radius)");
    expect(get("rounded-md")).toContain("calc(var(--radius) - 2px)");
    expect(get("rounded-sm")).toContain("calc(var(--radius) - 4px)");
  });
});

describe("no bare `text-muted` utility in src (it renders shadcn's muted *background* color, not muted ink)", () => {
  // Blueprint muted ink is `text-muted-foreground` (tailwind.config.ts
  // `muted.foreground` -> `--muted-rgb`); bare `text-muted` resolves to
  // `muted.DEFAULT` -> `--surface-2-rgb`, a background tone, not text ink.
  // Negative lookbehind excludes unrelated identifiers that merely end in
  // "text-muted", e.g. src/styles/public.css's own `--public-text-muted` /
  // `.public-text-muted` (a separate, non-shadcn design system for the
  // public marketing pages, out of scope for this token layer).
  const BARE_TEXT_MUTED = /(?<![\w-])text-muted(?!-)/;

  function walk(dir: string, files: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full, files);
      } else if (/\.(tsx?|css)$/.test(entry)) {
        files.push(full);
      }
    }
    return files;
  }

  it("has no `text-muted` (bare) occurrences under src/", () => {
    const srcDir = resolve(__dirname, "../..");
    const offenders: string[] = [];

    for (const file of walk(srcDir)) {
      const contents = readFileSync(file, "utf8");
      const lines = contents.split("\n");
      lines.forEach((line, i) => {
        if (BARE_TEXT_MUTED.test(line)) {
          offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
