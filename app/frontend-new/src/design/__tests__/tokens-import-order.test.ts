import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * CSS ignores an @import that follows any other rule. index.css used to
 * import tokens.css after the @tailwind directives, so the build dropped it
 * and every token defined only in tokens.css (--font, --ok, --cat-*, ...)
 * was undefined at runtime while unit tests stayed green.
 */
describe("index.css imports tokens.css first", () => {
  it("has the tokens @import before any other statement", () => {
    const css = readFileSync(resolve(__dirname, "../../index.css"), "utf8");
    const statements = css
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    expect(statements[0]).toBe('@import "./design/tokens.css";');
  });
});
