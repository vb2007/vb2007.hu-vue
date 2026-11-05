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

  it("names the format first, like the API, when a URL is also too long", () => {
    expect(validateShortUrl("example.com")).toBe("Invalid URL / URI format.");
    expect(validateShortUrl("a".repeat(2001))).toBe("Invalid URL / URI format.");
  });
});
