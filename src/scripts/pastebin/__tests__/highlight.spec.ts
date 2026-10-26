import { describe, expect, it } from "vitest";
import { PASTE_LANGUAGES } from "@/scripts/pastebin/languages";
import { hljs, highlightCode } from "@/scripts/pastebin/highlight";

describe("highlight.js", () => {
  it.each(PASTE_LANGUAGES)("has $label registered", ({ id }) => {
    expect(hljs.getLanguage(id)).toBeDefined();
  });
});

describe("highlightCode", () => {
  it("marks up tokens in the given language", () => {
    expect(highlightCode("def greet(): pass", "python")).toContain(
      '<span class="hljs-keyword">def</span>'
    );
  });

  it("escapes the text, so markup in a paste stays text", () => {
    expect(highlightCode("<script>alert(1)</script>", "plaintext")).toBe(
      "&lt;script&gt;alert(1)&lt;/script&gt;"
    );
  });

  it("treats an unknown language as plain text", () => {
    expect(highlightCode("def x", "brainfuck")).toBe("def x");
  });
});
