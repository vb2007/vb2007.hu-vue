import { describe, expect, it } from "vitest";
import { validateShortUrl } from "@/scripts/shorten/shortUrl";

const ofLength = (length: number) =>
  `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;

describe("validateShortUrl", () => {
  it("accepts a URL up to the API's 2000 characters", () => {
    expect(validateShortUrl("https://example.com")).toBe("");
    expect(validateShortUrl(ofLength(2000))).toBe("");
  });

  it("names the length and the limit over 2000 characters", () => {
    expect(validateShortUrl(ofLength(2001))).toBe(
      `This URL is ${(2001).toLocaleString()} characters; the limit is ${(2000).toLocaleString()}.`
    );
    expect(validateShortUrl(ofLength(2430))).toContain(`is ${(2430).toLocaleString()} characters`);
  });

  it("counts the URL as sent, in UTF-16 units like the API", () => {
    expect(validateShortUrl(`${ofLength(1999)}😀`)).toContain(`${(2001).toLocaleString()}`);
  });

  it.each([
    ["a space", "https://example.com/a b"],
    ["a trailing space", "https://example.com/ "],
    ["a leading space", " https://example.com/"],
    ["a tab", "https://example.com/a\tb"],
    ["a line break", "https://example.com/a\nb"],
    ["a no-break space", "https://example.com/a\u00A0b"]
  ])("refuses a URL with %s, like the API", (_, url) => {
    expect(validateShortUrl(url)).toBe(
      "A URL can't contain spaces. Remove them, or write each one as %20."
    );
  });

  it("names whitespace before the length, like the API", () => {
    expect(validateShortUrl(`${ofLength(2001)} `)).toBe(
      "A URL can't contain spaces. Remove them, or write each one as %20."
    );
  });

  it("names the format first, like the API, when a URL is also too long", () => {
    expect(validateShortUrl("example.com")).toBe("Invalid URL / URI format.");
    expect(validateShortUrl("a".repeat(2001))).toBe("Invalid URL / URI format.");
    expect(validateShortUrl("example.com/a b")).toBe("Invalid URL / URI format.");
    expect(validateShortUrl(" example.com")).toBe("Invalid URL / URI format.");
  });
});
