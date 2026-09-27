import { describe, expect, it } from "vitest";
import i18n from "../index";

describe("i18n setup (T038)", () => {
  it("initializes with English as the active and fallback language", () => {
    expect(i18n.language).toBe("en");
    expect(i18n.options.fallbackLng).toEqual(["en"]);
  });

  it("resolves shell strings from en.json", () => {
    expect(i18n.t("shell.skipToContent")).toBe("Skip to content");
    expect(i18n.t("shell.undo.undo")).toBe("Undo");
  });

  it("interpolates plural counts", () => {
    expect(i18n.t("shell.status.runningCount", { count: 1 })).toBe("1 running");
    expect(i18n.t("shell.status.runningCount", { count: 3 })).toBe("3 running");
  });

  it("interpolates named variables", () => {
    expect(i18n.t("shell.inspector.resize", { detent: "peek" })).toBe("Resize panel (currently peek)");
  });
});
