import { describe, expect, it } from "vitest";
import { formatBytes } from "@/scripts/utility/sizeUtil";

describe("formatBytes", () => {
  it.each([
    [0, "0 bytes"],
    [1, "1 byte"],
    [-5, "0 bytes"],
    [1023, "1,023 bytes"],
    [1024, "1 kB"],
    [1536, "1.5 kB"],
    [5 * 1024 * 1024, "5 MB"],
    [150 * 1024 * 1024, "150 MB"],
    [10 * 1024 ** 3, "10 GB"],
    [3 * 1024 ** 4, "3 TB"],
    [5000 * 1024 ** 4, "5,000 TB"]
  ])("formats %d bytes as %s", (bytes, expected) => {
    expect(formatBytes(bytes, "en")).toBe(expected);
  });

  it("follows the given locale", () => {
    expect(formatBytes(1536, "hu")).toBe("1,5 kB");
  });
});
