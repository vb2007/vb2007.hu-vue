import { describe, expect, it } from "vitest";
import { jsonResponse } from "@/__tests__/helpers/fetch";
import {
  PASTE_MAX_LENGTH,
  displayLink,
  errorFrom,
  pasteLink,
  pastePreview,
  pasteSize,
  validatePaste
} from "@/scripts/pastebin/paste";

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

describe("displayLink", () => {
  it.each([
    ["https://vb2007.hu/pastebin/abc", "vb2007.hu/pastebin/abc"],
    ["http://localhost:4173/pastebin/abc", "localhost:4173/pastebin/abc"],
    ["vb2007.hu/x", "vb2007.hu/x"]
  ])("shows %s as %s", (link, shown) => {
    expect(displayLink(link)).toBe(shown);
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
    ["x".repeat(PASTE_MAX_LENGTH + 1), "A paste can be at most 10000 characters."]
  ])("rejects %j", (content, message) => {
    expect(validatePaste(content)).toBe(message);
  });

  it.each(["ab", "x".repeat(PASTE_MAX_LENGTH)])("accepts content within the limits", (content) => {
    expect(validatePaste(content)).toBe("");
  });
});

describe("errorFrom", () => {
  it("prefers the API's error message", async () => {
    expect(await errorFrom(jsonResponse(404, { error: "No such paste." }), "Failed")).toBe(
      "No such paste."
    );
  });

  it("falls back to the status text when the body has no message", async () => {
    expect(await errorFrom(jsonResponse(403, {}, "Forbidden"), "Failed")).toBe("Failed: Forbidden");
  });

  it("falls back to the status code when the body is not JSON and there is no status text", async () => {
    expect(await errorFrom(jsonResponse(500), "Failed")).toBe("Failed: 500");
  });
});
