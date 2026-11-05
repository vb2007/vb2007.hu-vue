import { describe, expect, it, vi } from "vitest";
import {
  displayLink,
  isSafeRedirect,
  MAX_ADDRESS,
  readableAddress,
  validateUrl
} from "@/scripts/utility/text";

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

describe("readableAddress", () => {
  it.each([
    ["an ordinary path", "/foo?x=1", "/foo?x=1"],
    ["accented letters", "/árvíz?q=é", "/árvíz?q=é"],
    ["a bidi override", "/docs/‮fdp.exe", "/docs/%E2%80%AEfdp.exe"],
    ["an invisible format character", "/a​b", "/a%E2%80%8Bb"],
    ["a lone surrogate", "/a\uD800b", "/a%EF%BF%BDb"],
    [
      "a made-up sentence",
      "/\n\nYour session expired. Log in again",
      "/%0A%0AYour%20session%20expired.%20Log%20in%20again"
    ],
    [
      "a sentence spaced with Braille blanks",
      "/Your⠀session⠀expired",
      "/Your%E2%A0%80session%E2%A0%80expired"
    ],
    ["a Hangul filler", "/aㅤb", "/a%E3%85%A4b"],
    ["a Hangul choseong filler", "/aᅟb", "/a%E1%85%9Fb"],
    ["a Hangul jungseong filler", "/aᅠb", "/a%E1%85%A0b"],
    ["a halfwidth Hangul filler", "/aﾠb", "/a%EF%BE%A0b"],
    ["an emoji family joined with ZWJ", "/👨‍👩‍👧", "/👨‍👩‍👧"],
    ["a rainbow flag", "/🏳️‍🌈", "/🏳️‍🌈"],
    ["a Persian word with ZWNJ", "/می‌خواهم", "/می‌خواهم"],
    ["two marks on one letter", "/ệ", "/ệ"],
    ["a pile of marks", "/a" + "̸".repeat(4), "/a̸̸%CC%B8%CC%B8"]
  ])("shows %s safely", (_name, address, shown) => {
    expect(readableAddress(address)).toBe(shown);
  });

  it("keeps an address at the limit whole", () => {
    const atLimit = "/" + "a".repeat(MAX_ADDRESS - 1);

    expect(readableAddress(atLimit)).toBe(atLimit);
  });

  it("cuts a longer one by character, not by UTF-16 unit", () => {
    expect(readableAddress("/" + "😀".repeat(500))).toBe("/" + "😀".repeat(MAX_ADDRESS - 1) + "…");
  });

  it("never cuts a letter from its marks", () => {
    const address = "/" + "é".repeat(MAX_ADDRESS);

    expect(readableAddress(address)).toBe("/" + "é".repeat(MAX_ADDRESS / 2) + "…");
  });

  it("keeps the whole address when only its last marks are past the limit", () => {
    const address = "/" + "a".repeat(MAX_ADDRESS - 1) + "́́";

    expect(readableAddress(address)).toBe(address);
  });
});
