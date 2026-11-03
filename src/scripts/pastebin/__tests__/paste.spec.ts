import { describe, expect, it } from "vitest";
import { Limits } from "@/constants/limits";
import { pasteLink, pastePreview, pasteSize, validatePaste } from "@/scripts/pastebin/paste";

describe("pasteLink", () => {
  it("points at the paste's page on this site", () => {
    expect(pasteLink("abc123")).toBe(`${window.location.origin}/pastebin/abc123`);
  });
});

describe("pastePreview", () => {
  it("uses the first non-empty line", () => {
    expect(pastePreview("\n\n  first line\nsecond line")).toBe("first line");
  });
});

describe("pasteSize", () => {
  it.each([
    ["a", "1 line · 1 character"],
    ["ab", "1 line · 2 characters"],
    ["a\nb", "2 lines · 3 characters"]
  ])("describes %j as %s", (content, size) => {
    expect(pasteSize(content)).toBe(size);
  });
});

describe("validatePaste", () => {
  it.each([
    ["", "A paste needs at least 2 characters."],
    ["  a \n", "A paste needs at least 2 characters."],
    ["x".repeat(Limits.Paste.maxLength + 1), "A paste can be at most 10000 characters."]
  ])("rejects %j", (content, message) => {
    expect(validatePaste(content)).toBe(message);
  });

  it.each(["ab", "x".repeat(Limits.Paste.maxLength)])(
    "accepts content within the limits",
    (content) => {
      expect(validatePaste(content)).toBe("");
    }
  );
});
