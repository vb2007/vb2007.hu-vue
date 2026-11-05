import { describe, expect, it } from "vitest";
import { formatWait } from "@/scripts/utility/durationUtil";

describe("formatWait", () => {
  it.each([
    [0, "0 sec"],
    [-5, "0 sec"],
    [1, "1 sec"],
    [41.3, "42 sec"],
    [59, "59 sec"],
    [60, "1 min"],
    [61, "2 min"],
    [900, "15 min"],
    [3540, "59 min"],
    [3541, "1 hr"],
    [3600, "1 hr"],
    [3601, "1 hr 1 min"],
    [3900, "1 hr 5 min"],
    [86400, "24 hr"]
  ])("formats %d seconds as %s", (seconds, expected) => {
    expect(formatWait(seconds, "en")).toBe(expected);
  });

  it("follows the given locale", () => {
    expect(formatWait(42, "hu")).toBe("42 mp");
  });
});
