import { describe, expect, it } from "vitest";
import { PASTE_LANGUAGES, isKnownLanguage, languageLabel } from "@/scripts/pastebin/languages";

describe("PASTE_LANGUAGES", () => {
  it("has unique ids", () => {
    const ids = PASTE_LANGUAGES.map((language) => language.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("starts with plain text and Markdown", () => {
    expect(PASTE_LANGUAGES.slice(0, 2).map((language) => language.id)).toEqual([
      "plaintext",
      "markdown"
    ]);
  });
});

describe("isKnownLanguage", () => {
  it.each([
    ["python", true],
    ["plaintext", true],
    ["brainfuck", false],
    ["", false],
    [undefined, false]
  ])("%j is %s", (id, known) => {
    expect(isKnownLanguage(id)).toBe(known);
  });
});

describe("languageLabel", () => {
  it.each([
    ["cpp", "C++"],
    ["xml", "HTML / XML"],
    ["brainfuck", "Plain text"]
  ])("names %j %j", (id, label) => {
    expect(languageLabel(id)).toBe(label);
  });
});
