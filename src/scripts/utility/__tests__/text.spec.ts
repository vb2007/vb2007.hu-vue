import { describe, expect, it, vi } from "vitest";
import { displayLink, isSafeRedirect, validateUrl } from "@/scripts/utility/text";

describe("validateUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com/path?q=1",
    "mailto:me@example.com",
    "ssh://host"
  ])("accepts %s", (url) => {
    expect(validateUrl(url)).toBe(true);
  });

  it("ignores the case of the scheme", () => {
    expect(validateUrl("HTTPS://EXAMPLE.COM")).toBe(true);
  });

  it.each(["example.com", "javascript:alert(1)", "", " https://example.com"])(
    "rejects %j",
    (url) => {
      expect(validateUrl(url)).toBe(false);
    }
  );

  it("returns false instead of throwing on a non-string value", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(validateUrl(undefined as unknown as string)).toBe(false);
    expect(consoleError).toHaveBeenCalled();
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

describe("isSafeRedirect", () => {
  it.each(["https://example.com", "http://example.com/x", "mailto:me@example.com", "ssh://host"])(
    "allows %s",
    (url) => {
      expect(isSafeRedirect(url)).toBe(true);
    }
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox",
    "blob:https://example.com/id",
    "not a url"
  ])("refuses %s", (url) => {
    expect(isSafeRedirect(url)).toBe(false);
  });
});
