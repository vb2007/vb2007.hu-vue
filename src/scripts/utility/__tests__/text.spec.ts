import { describe, expect, it, vi } from "vitest";
import { validateUrl } from "@/scripts/utility/text";

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
