import { describe, expect, it } from "vitest";
import { validateShortUrl, validateShortUrlWhileTyping } from "@/scripts/shorten/shortUrl";

const ofLength = (length: number) =>
  `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;

const INNER = "A URL can't contain spaces: write each one as %20.";
const EDGE = "Remove the space at the start or end of the URL.";
const FORMAT = "Invalid URL / URI format.";

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
    ["a tab", "https://example.com/a\tb"],
    ["a line break", "https://example.com/a\nb"],
    ["a no-break space", "https://example.com/a b"],
    ["a space and one at the end", "https://example.com/a b "]
  ])("refuses a URL with %s inside it, like the API", (_, url) => {
    expect(validateShortUrl(url)).toBe(INNER);
  });

  it.each([
    ["a trailing space", "https://example.com/ "],
    ["a leading space", " https://example.com/"],
    ["a trailing line break", "https://example.com/\n"],
    ["spaces at both ends", "  https://example.com/\t"]
  ])("asks to remove %s, like the API refuses it", (_, url) => {
    expect(validateShortUrl(url)).toBe(EDGE);
  });

  it("names whitespace before the length, like the API", () => {
    expect(validateShortUrl(`${ofLength(2001)} `)).toBe(EDGE);
    expect(validateShortUrl(`${ofLength(2001)}a b`)).toBe(INNER);
  });

  it("names the format first, like the API, when a URL is also too long", () => {
    expect(validateShortUrl("example.com")).toBe(FORMAT);
    expect(validateShortUrl("a".repeat(2001))).toBe(FORMAT);
    expect(validateShortUrl("example.com/a b")).toBe(FORMAT);
    expect(validateShortUrl(" example.com")).toBe(FORMAT);
    expect(validateShortUrl("   ")).toBe(FORMAT);
  });
});

describe("validateShortUrlWhileTyping", () => {
  it("says nothing of a URL that's fine or not yet complete", () => {
    expect(validateShortUrlWhileTyping("https://example.com")).toBe("");
    expect(validateShortUrlWhileTyping("")).toBe("");
    expect(validateShortUrlWhileTyping("htt")).toBe("");
    expect(validateShortUrlWhileTyping(" h")).toBe("");
    expect(validateShortUrlWhileTyping("example.com/a b")).toBe("");
    expect(validateShortUrlWhileTyping("   ")).toBe("");
  });

  it("waits on a space at the end, which the next key may put inside the URL", () => {
    expect(validateShortUrlWhileTyping("https://example.com/a ")).toBe("");
  });

  it("names a space inside a URL with a scheme, or before it", () => {
    expect(validateShortUrlWhileTyping("https://example.com/a b")).toBe(INNER);
    expect(validateShortUrlWhileTyping(" https://example.com")).toBe(EDGE);
  });

  it("names what's wrong with a URL over the limit, in the API's order", () => {
    expect(validateShortUrlWhileTyping(ofLength(2001))).toContain("the limit is");
    expect(validateShortUrlWhileTyping("a".repeat(2001))).toBe(FORMAT);
    expect(validateShortUrlWhileTyping(`${ofLength(2001)} `)).toBe(EDGE);
  });
});
