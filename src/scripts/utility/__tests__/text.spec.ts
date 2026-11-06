import { describe, expect, it, vi } from "vitest";
import {
  addressParts,
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

describe("addressParts", () => {
  const parts = (scheme: string, userinfo: string, host: string, rest: string) => ({
    scheme,
    userinfo,
    host,
    rest
  });

  it.each([
    ["https://example.com/a/b?c#d", parts("", "", "example.com", "/a/b?c#d")],
    ["HTTP://Example.com", parts("", "", "example.com", "/")],
    ["http://localhost:4173/x", parts("", "", "localhost:4173", "/x")],
    ["https://me@evil.example/login", parts("", "me@", "evil.example", "/login")],
    ["https://me:pw@evil.example/", parts("", "me:pw@", "evil.example", "/")],
    ["ftp://files.example/pub", parts("ftp://", "", "files.example", "/pub")],
    ["ssh://git@host.example", parts("ssh://", "git@", "host.example", "")]
  ])("splits %j by the host the browser goes to", (address, expected) => {
    expect(addressParts(address)).toEqual(expected);
  });

  it("shows the real host of a backslash trick, and the rest as the browser reads it", () => {
    expect(addressParts("https://evil.example\\@google.com/login")).toEqual(
      parts("", "", "evil.example", "/@google.com/login")
    );
  });

  it.each([
    ["javascript:alert(1)"],
    ["data:text/html,<script>alert(1)</script>"],
    ["mailto:me@example.com?subject=hi"]
  ])("gives %j no host, since it has none", (address) => {
    expect(addressParts(address)).toEqual(parts("", "", "", address));
  });

  it("splits an address URL can't read by its text", () => {
    expect(addressParts("https://me@exa\u202Eelpm.com/x y")).toEqual(
      parts("", "me@", "exa\u202Eelpm.com", "/x y")
    );
    expect(addressParts("FTP://bad host/pub")).toEqual(parts("FTP://", "", "bad host", "/pub"));
    expect(addressParts("http://bad host")).toEqual(parts("", "", "bad host", ""));
  });

  it("keeps the whole of a very long address", () => {
    const path = "/" + "a".repeat(5000);
    expect(addressParts(`https://example.com${path}`)).toEqual(parts("", "", "example.com", path));
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
    ["a bidi override", "/docs/\u202Efdp.exe", "/docs/%E2%80%AEfdp.exe"],
    ["an invisible format character", "/a\u200Bb", "/a%E2%80%8Bb"],
    ["a lone surrogate", "/a\uD800b", "/a%EF%BF%BDb"],
    [
      "a made-up sentence",
      "/\n\nYour session expired. Log in again",
      "/%0A%0AYour%20session%20expired.%20Log%20in%20again"
    ],
    [
      "a sentence spaced with Braille blanks",
      "/Your\u2800session\u2800expired",
      "/Your%E2%A0%80session%E2%A0%80expired"
    ],
    ["a Hangul filler", "/a\u3164b", "/a%E3%85%A4b"],
    ["a Hangul choseong filler", "/a\u115Fb", "/a%E1%85%9Fb"],
    ["a Hangul jungseong filler", "/a\u1160b", "/a%E1%85%A0b"],
    ["a halfwidth Hangul filler", "/a\uFFA0b", "/a%EF%BE%A0b"],
    ["an emoji family joined with ZWJ", "/👨\u200D👩\u200D👧", "/👨\u200D👩\u200D👧"],
    ["a rainbow flag", "/🏳\uFE0F\u200D🌈", "/🏳\uFE0F\u200D🌈"],
    ["a Persian word with ZWNJ", "/می\u200Cخواهم", "/می\u200Cخواهم"],
    ["two marks on one letter", "/e\u0323\u0302", "/e\u0323\u0302"],
    ["a pile of marks", "/a" + "\u0338".repeat(4), "/a\u0338\u0338%CC%B8%CC%B8"]
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
    const address = "/" + "e\u0301".repeat(MAX_ADDRESS);

    expect(readableAddress(address)).toBe("/" + "e\u0301".repeat(MAX_ADDRESS / 2) + "…");
  });

  it("keeps the whole address when only its last marks are past the limit", () => {
    const address = "/" + "a".repeat(MAX_ADDRESS - 1) + "\u0301\u0301";

    expect(readableAddress(address)).toBe(address);
  });
});
