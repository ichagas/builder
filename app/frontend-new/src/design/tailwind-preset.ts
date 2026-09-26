import type { Config } from "tailwindcss";

/**
 * Tailwind preset (T021). Wires the design tokens in `tokens.css` into
 * Tailwind color/typography/radius/spacing/layout utilities so that classes
 * named in contracts/design-system.md §1 and §1.1 exist, e.g.:
 *
 *   text-ok, bg-ok, border-ok, bg-ok-soft
 *   text-bad, bg-bad, border-bad, bg-bad-soft
 *   text-warn, bg-warn, border-warn, bg-warn-soft
 *   bg-primary-soft (already backed by --accent via shadcn, see T020)
 *   text-define, bg-define, ... (phase colors), text-feat, bg-feat, bg-feat-soft (change types)
 *   bg-mesh-green|yellow|red|blue
 *   bg-mode-building|released|connected
 *   bg-rail-bg, text-rail-ink, border-rail-line, bg-rail-hover, bg-rail-active, text-rail-muted
 *   bg-gbar (gbar-bg), border-gbar-line, text-gbar-ink
 *   bg-surface, bg-surface-2, border-line, border-line-2, text-ink, text-muted
 *   bg-chart-1 .. bg-chart-6
 *
 * Every color is defined with the `rgb(var(--x-rgb) / <alpha-value>)` pattern
 * (see tokens.css's `-rgb` channel triples), so opacity modifiers work even
 * though the underlying value is a CSS variable, e.g. `bg-ok/10`,
 * `border-primary/40`.
 */

function themeColor(rgbVar: string) {
  return `rgb(var(${rgbVar}) / <alpha-value>)`;
}

/** A color group with a base value and a "soft" (light background tint) variant. */
function softGroup(name: string) {
  return {
    DEFAULT: themeColor(`--${name}-rgb`),
    soft: themeColor(`--${name}-soft-rgb`),
  };
}

export const designSystemPreset = {
  darkMode: ["class"],
  theme: {
    extend: {
      colors: {
        // Surface / text primitives
        bg: themeColor("--bg-rgb"),
        surface: {
          DEFAULT: themeColor("--surface-rgb"),
          2: themeColor("--surface-2-rgb"),
        },
        line: {
          DEFAULT: themeColor("--line-rgb"),
          2: themeColor("--line-2-rgb"),
        },
        ink: themeColor("--ink-rgb"),
        muted: themeColor("--muted-rgb"),
        focus: themeColor("--focus-rgb"),

        // Status
        ok: softGroup("ok"),
        warn: softGroup("warn"),
        bad: softGroup("bad"),
        run: softGroup("run"),

        // Brand (primary/primary-soft are already re-pointed onto the
        // shadcn `primary`/`accent` tokens in index.css; these aliases give
        // the exact class names the design-system contract and codemod use)
        "primary-soft": themeColor("--primary-soft-rgb"),

        // Phases (Define / Design / Build / Ship)
        define: themeColor("--c-define-rgb"),
        design: themeColor("--c-design-rgb"),
        build: themeColor("--c-build-rgb"),
        ship: themeColor("--c-ship-rgb"),

        // Change types (bug / feature / enhancement / baseline)
        bug: softGroup("t-bug"),
        feat: softGroup("t-feat"),
        enh: softGroup("t-enh"),
        base: softGroup("t-base"),

        // Assurance Mesh agents
        mesh: {
          green: themeColor("--m-green-rgb"),
          yellow: themeColor("--m-yellow-rgb"),
          red: themeColor("--m-red-rgb"),
          blue: themeColor("--m-blue-rgb"),
        },

        // Mode band
        mode: {
          building: themeColor("--mode-building-rgb"),
          released: themeColor("--mode-released-rgb"),
          connected: themeColor("--mode-connected-rgb"),
        },

        // Chrome (rail + global bar)
        rail: {
          bg: themeColor("--rail-bg-rgb"),
          ink: themeColor("--rail-ink-rgb"),
          muted: themeColor("--rail-muted-rgb"),
          hover: themeColor("--rail-hover-rgb"),
          line: themeColor("--rail-line-rgb"),
          active: themeColor("--rail-active-rgb"),
        },
        gbar: {
          DEFAULT: themeColor("--gbar-bg-rgb"),
          ink: themeColor("--gbar-ink-rgb"),
          line: themeColor("--gbar-line-rgb"),
        },

        // Charts (derived from the phase/status palette; used by the T031
        // codemod for hex values found in `style={}`/`stroke`/`fill`)
        chart: {
          1: themeColor("--chart-1-rgb"),
          2: themeColor("--chart-2-rgb"),
          3: themeColor("--chart-3-rgb"),
          4: themeColor("--chart-4-rgb"),
          5: themeColor("--chart-5-rgb"),
          6: themeColor("--chart-6-rgb"),
        },
      },

      fontFamily: {
        sans: ["var(--font)"],
        mono: ["var(--mono)"],
      },
      fontSize: {
        base: "var(--fs)",
        h1: ["var(--h1)", { fontWeight: "var(--h1-weight)" }],
        h2: ["var(--h2)", { fontWeight: "var(--h2-weight)" }],
      },

      borderRadius: {
        DEFAULT: "var(--radius)",
        // Named "xs", not "s": Tailwind core (v3.3+) already reserves
        // `rounded-s`/`-e`/`-ss`/`-se`/`-es`/`-ee`/`-tl`/`-tr`/`-bl`/`-br` for
        // logical/physical corner utilities. A same-named preset key doesn't
        // override those — both get emitted, and whichever wins in the
        // generated CSS renders only the *start* corners at this radius. See
        // `__tests__/no-reserved-radius-key.test.ts` for a build-output check.
        xs: "var(--radius-s)",
        pill: "var(--radius-pill)",
      },

      spacing: {
        row: "var(--row)",
        "row-min": "var(--row-min)",
        pad: "var(--pad)",
        gap: "var(--gap)",
        "rail-w": "var(--rail-w)",
        "rail-w-collapsed": "var(--rail-w-collapsed)",
        "bar-h": "var(--bar-h)",
        "timeline-h": "var(--timeline-h)",
        "tabbar-h": "var(--tabbar-h)",
      },

      boxShadow: {
        pop: "var(--shadow-pop)",
      },
    },
  },
} satisfies Partial<Config>;

export default designSystemPreset;
