/**
 * Custom ESLint rule: no-raw-tailwind-colors (T018)
 *
 * Flags raw Tailwind palette color utility classes (e.g. `text-red-500`,
 * `bg-gray-100`, `hover:border-slate-200`, `dark:bg-blue-500/50`) and hex
 * color literals (e.g. `#ff0000`, `#abc`) used directly in component code,
 * instead of going through the design token layer (`src/design/**`).
 *
 * Scope: className-like strings/template literals (JSX `className`/`class`
 * attributes, and calls to `cn`/`clsx`/`classnames`/`cx`/`twMerge`/`tv`,
 * including conditional-object keys and array elements passed to them), plus
 * hex literals in `style={{ ... }}` object literal property values.
 *
 * This file is intentionally framework-light (no eslint-plugin-* dependency)
 * so it can be unit-tested directly with ESLint's RuleTester.
 *
 * Severity (warn vs error) is controlled by the consuming eslint.config.js,
 * not by this rule — see T018 (warn) / T031 (switch to error).
 */

// Tailwind's default palette color names (v3/v4). Deliberately excludes
// non-palette keywords like "black", "white", "transparent", "current",
// "inherit" — those aren't part of the token migration's raw-color concern.
const PALETTE_COLORS = [
  "slate",
  "gray",
  "grey",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
].join("|");

// Utility prefixes that take a `-<color>-<shade>` suffix in Tailwind.
const UTILITY_PREFIXES = [
  "bg",
  "text",
  "border(?:-[trblxyse]|-spacing)?",
  "ring(?:-offset)?",
  "fill",
  "stroke",
  "divide",
  "outline",
  "decoration",
  "caret",
  "accent",
  "shadow",
  "from",
  "via",
  "to",
  "placeholder",
  "selection",
].join("|");

const SHADES = "50|100|150|200|300|400|500|600|700|800|900|950";

// Matches a full Tailwind class token, with any number of leading
// variant/prefix segments (hover:, dark:, sm:, group-hover:, etc.) and an
// optional trailing opacity modifier (/50, /[.12], etc.).
const TAILWIND_COLOR_TOKEN = new RegExp(
  `^(?:[a-z0-9_-]+:)*(?:${UTILITY_PREFIXES})-(?:${PALETTE_COLORS})-(?:${SHADES})(?:\\/(?:\\d{1,3}|\\[[^\\]]+\\]))?$`,
);

const HEX_COLOR = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/;

const CLASS_HELPER_CALLEES = new Set(["cn", "clsx", "classnames", "cx", "twMerge", "tv"]);

function findTailwindTokens(text) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .filter((token) => TAILWIND_COLOR_TOKEN.test(token));
}

function findHexColors(text) {
  const matches = text.match(new RegExp(HEX_COLOR, "g"));
  return matches ?? [];
}

// WP-F2b fix round 2, item 1: design-token color groups that carry legend/
// status meaning (contracts/design-system.md §1/§1.2). A `bg-X` with no
// opacity modifier and a `text-X` of the *same* X in one class string means
// the text is the exact color of its own background — invisible (1:1
// contrast). This bit the "External" badge
// (`text-define bg-define dark:bg-define/30`, WP-F2b fix round 2 review):
// the light-mode pairing had no modifier on `bg-define` at all. Deliberately
// a fixed list, not "any custom identifier" — Tailwind's own utility names
// (bg-transparent, text-current, etc.) and neutral tokens (ink/muted/surface/
// line/border) aren't legend colors and pairing them with themselves isn't
// this bug (e.g. a hypothetical `border-line text-line` isn't a contrast
// hazard the way `bg-warn text-warn` is).
const SAME_TOKEN_COLOR_NAMES = [
  "ok",
  "warn",
  "bad",
  "run",
  "primary",
  "define",
  "design",
  "build",
  "ship",
  "t-bug",
  "t-feat",
  "t-enh",
  "t-base",
  "mesh-green",
  "mesh-yellow",
  "mesh-red",
  "mesh-blue",
  "mode-building",
  "mode-released",
  "mode-connected",
  "cat-1",
  "cat-2",
  "cat-3",
  "cat-4",
  "cat-5",
  "cat-6",
  "cat-7",
  "cat-8",
].join("|");

// Captures an optional variant-prefix chain (dark:, hover:, group-hover: …)
// so `dark:bg-X` only collides with a `text-X` under the *same* prefix, and
// the color name itself, so `bg-ok-soft` doesn't collide with `text-ok`
// (different, deliberately unmodified, token).
const BG_SAME_TOKEN = new RegExp(`([\\w-]*:)?bg-(${SAME_TOKEN_COLOR_NAMES})(?![\\w-])`, "g");
const TEXT_SAME_TOKEN = new RegExp(`([\\w-]*:)?text-(${SAME_TOKEN_COLOR_NAMES})(?![\\w-])`, "g");

/**
 * Same-string, same-variant-prefix `bg-X`(no modifier)/`text-X` collisions.
 * Restricted to one string/template-quasi at a time (never merged across
 * cn() arguments or ternary branches) so mutually exclusive conditional
 * branches — e.g. `isActive && "bg-primary text-primary-foreground"` next to
 * `isCompleted && "bg-primary/20 text-primary"` — are never combined into a
 * false positive: each is its own string and is checked on its own.
 */
function findSameTokenTextBgCollisions(text) {
  const bgMatches = [...text.matchAll(BG_SAME_TOKEN)];
  if (!bgMatches.length) return [];
  const textMatches = [...text.matchAll(TEXT_SAME_TOKEN)];
  if (!textMatches.length) return [];

  const hits = [];
  for (const bm of bgMatches) {
    const after = text.slice(bm.index + bm[0].length, bm.index + bm[0].length + 1);
    if (after === "/") continue; // bg has its own opacity modifier: not this bug
    const prefix = bm[1] || "";
    const token = bm[2];
    const collides = textMatches.some((tm) => (tm[1] || "") === prefix && tm[2] === token);
    if (collides) hits.push(`${prefix}bg-${token}` + " / " + `${prefix}text-${token}`);
  }
  return hits;
}

/**
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('estree').Node} node
 * @param {string} text
 * @param {{allowHex?: boolean, allowTailwind?: boolean, seen?: WeakSet<object>}} [opts]
 */
function reportInString(context, node, text, opts = {}) {
  const { allowHex = true, allowTailwind = true, seen } = opts;

  // T031 (WP-F2b): several entry points below can now reach the same
  // string/quasi node (e.g. a `style={{ ... }}` property value is checked
  // directly by the JSXAttribute handler *and* would otherwise be re-walked
  // by the new whole-file `Property` visitor below). Report each node at
  // most once so switching this rule to "error" doesn't produce duplicate
  // errors for one real violation.
  if (seen) {
    if (seen.has(node)) return;
    seen.add(node);
  }

  if (allowTailwind) {
    for (const token of findTailwindTokens(text)) {
      context.report({
        node,
        messageId: "rawTailwindColor",
        data: { token },
      });
    }
  }

  if (allowHex) {
    for (const hex of findHexColors(text)) {
      context.report({
        node,
        messageId: "rawHexColor",
        data: { hex },
      });
    }
  }

  // WP-F2b fix round 2, item 1: same-token text-X/bg-X (no modifier)
  // collision — see findSameTokenTextBgCollisions. Runs for both
  // Tailwind-class strings and hex-only `style={{}}` strings would be
  // meaningless for the latter (style values aren't Tailwind classes), so
  // gate on `allowTailwind` the same way the raw-Tailwind-token check does.
  if (allowTailwind) {
    for (const pair of findSameTokenTextBgCollisions(text)) {
      context.report({
        node,
        messageId: "sameTokenTextBg",
        data: { pair },
      });
    }
  }
}

/**
 * Recursively walks an expression that can appear as a "class value"
 * (a plain string, a template literal, a ternary between two class values,
 * a logical `a && "classes"`, an array of class values, or an object whose
 * keys are class name strings) and reports any raw Tailwind color tokens or
 * hex literals found in string positions.
 *
 * @param {import('eslint').Rule.RuleContext} context
 * @param {import('estree').Node | null | undefined} node
 * @param {WeakSet<object>} [seen]
 */
function checkClassValueExpression(context, node, seen) {
  if (!node) return;

  switch (node.type) {
    case "Literal":
      if (typeof node.value === "string") {
        reportInString(context, node, node.value, { seen });
      }
      break;

    case "TemplateLiteral":
      for (const quasi of node.quasis) {
        reportInString(context, quasi, quasi.value.raw, { seen });
      }
      // T031 (WP-F2b) fix: a template literal's `${...}` interpolations
      // were never walked, so a conditional expression living inside one
      // (e.g. `` `p-3 ${cond ? "border-green-500/50 bg-green-500/10" :
      // "bg-muted/50"}` ``) was invisible to this rule even though it is a
      // real, rendered class string — mirrors the colors-to-tokens codemod
      // fix for the same gap.
      for (const expr of node.expressions) {
        checkClassValueExpression(context, expr, seen);
      }
      break;

    case "ConditionalExpression":
      checkClassValueExpression(context, node.consequent, seen);
      checkClassValueExpression(context, node.alternate, seen);
      break;

    case "LogicalExpression":
      checkClassValueExpression(context, node.left, seen);
      checkClassValueExpression(context, node.right, seen);
      break;

    case "ArrayExpression":
      for (const el of node.elements) {
        checkClassValueExpression(context, el, seen);
      }
      break;

    case "ObjectExpression":
      for (const prop of node.properties) {
        if (prop.type !== "Property") continue;
        if (prop.key.type === "Literal" && typeof prop.key.value === "string") {
          reportInString(context, prop.key, prop.key.value, { seen });
        } else if (prop.key.type === "Identifier" && !prop.computed) {
          // `{ "bg-red-500": cond }` is the common case above; a bare
          // identifier key (`{ active: cond }`) is not a class string.
        }
        // T031 (WP-F2b) fix: also check the property *value* here, so an
        // object passed straight to cn()/clsx() as a lookup (e.g.
        // `cn(STATUS_STYLES[status])` isn't this shape, but
        // `cn({ base: true, [STATUS_STYLES[status]]: true })` style code
        // sometimes nests a literal class string as a value too) is
        // covered the same way the standalone-object-literal visitor
        // below covers the far more common top-level lookup-table case.
        checkClassValueExpression(context, prop.value, seen);
      }
      break;

    default:
      break;
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const noRawTailwindColorsRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow raw Tailwind palette color classes and hex color literals outside the design token layer (src/design/**).",
    },
    schema: [],
    messages: {
      rawTailwindColor:
        'Raw Tailwind color class "{{token}}" bypasses the design token layer. Use a design token (see src/design/) instead.',
      rawHexColor:
        'Raw hex color literal "{{hex}}" bypasses the design token layer. Use a design token (see src/design/) instead.',
      sameTokenTextBg:
        'Text and background use the same token with no opacity modifier ("{{pair}}") — the text is invisible against its own background. Add an opacity modifier (e.g. "bg-X/10") or a "-soft" background variant.',
    },
  },
  create(context) {
    // Per-file dedupe set (see reportInString): several visitors below can
    // reach the same AST node (a style={{}} property value is handled
    // directly here *and* would otherwise be re-walked by the standalone
    // ObjectExpression visitor added for the class-lookup-table case).
    const seen = new WeakSet();

    return {
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name !== "className" && name !== "class" && name !== "style") return;

        if (name === "style") {
          // style={{ color: "#fff", background: someVar }}
          if (
            node.value &&
            node.value.type === "JSXExpressionContainer" &&
            node.value.expression.type === "ObjectExpression"
          ) {
            for (const prop of node.value.expression.properties) {
              if (prop.type !== "Property") continue;
              if (prop.value.type === "Literal" && typeof prop.value.value === "string") {
                reportInString(context, prop.value, prop.value.value, { allowTailwind: false, seen });
              } else if (prop.value.type === "TemplateLiteral") {
                for (const quasi of prop.value.quasis) {
                  reportInString(context, quasi, quasi.value.raw, { allowTailwind: false, seen });
                }
              }
            }
          }
          return;
        }

        // className="..." (plain string)
        if (node.value && node.value.type === "Literal" && typeof node.value.value === "string") {
          reportInString(context, node.value, node.value.value, { seen });
          return;
        }

        // className={...} (expression container: template literal, cn(...), ternary, etc.)
        if (node.value && node.value.type === "JSXExpressionContainer") {
          checkClassValueExpression(context, node.value.expression, seen);
        }
      },

      CallExpression(node) {
        const callee = node.callee;
        const calleeName =
          callee.type === "Identifier"
            ? callee.name
            : callee.type === "MemberExpression" && callee.property.type === "Identifier"
              ? callee.property.name
              : null;

        if (!calleeName || !CLASS_HELPER_CALLEES.has(calleeName)) return;

        for (const arg of node.arguments) {
          checkClassValueExpression(context, arg, seen);
        }
      },

      // T031 (WP-F2b) fix: a status/type -> classes lookup table used later
      // via `className={MAP[key]}` (e.g. `const typeColors = { EPIC:
      // "bg-purple-500/10 text-purple-700 ...", ... }`) is neither a
      // className value nor a class-helper-call argument at the point the
      // string literal appears, so neither visitor above ever sees it —
      // mirrors the colors-to-tokens codemod's step 3b. Every plain string
      // property value in the file is checked the same way a JSX className
      // string is; an ordinary non-class string property (e.g. `label:
      // "Send message"`) never matches the token/hex regexes, so nothing
      // unrelated is flagged, and `seen` skips anything a more specific
      // visitor already reported (style={{}} values, cn({...}) values).
      Property(node) {
        if (node.value.type === "Literal" && typeof node.value.value === "string") {
          reportInString(context, node.value, node.value.value, { seen });
        } else if (node.value.type === "TemplateLiteral") {
          checkClassValueExpression(context, node.value, seen);
        }
      },
    };
  },
};

/** @type {import('eslint').ESLint.Plugin} */
const plugin = {
  meta: {
    name: "token-lint",
  },
  rules: {
    "no-raw-tailwind-colors": noRawTailwindColorsRule,
  },
};

export default plugin;
export { noRawTailwindColorsRule };
