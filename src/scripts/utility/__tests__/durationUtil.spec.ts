import { describe, expect, it } from "vitest";
import { formatWait } from "@/scripts/utility/durationUtil";

describe("formatWait", () => {
  it.each([
    [0, "0 sec"],
    [-5, "0 sec"],
    [1, "1 sec"],
    [41.3, "42 sec"],
    [60, "60 sec"],
    // Seconds up to two minutes, so the count never reads "2 min" and then "1 min" for long.
    [119, "119 sec"],
    [120, "2 min"],
    [121, "3 min"],
    [900, "15 min"],
    [3412, "57 min"],
    [3540, "59 min"],
    [3541, "1 hr"],
    [3600, "1 hr"],
    [3601, "1 hr 1 min"],
    [3900, "1 hr 5 min"],
    [86400, "24 hr"]
  ])("formats %d seconds as %s", (seconds, expected) => {
    expect(formatWait(seconds)).toBe(expected);
  });

  it.each([
    [1, "1 second"],
    [42, "42 seconds"],
    [3412, "57 minutes"],
    [3660, "1 hour 1 minute"],
    [7200, "2 hours"]
  ])("spells %d seconds out as %s", (seconds, expected) => {
    expect(formatWait(seconds, undefined, "long")).toBe(expected);
  });

  it("follows a given locale", () => {
    expect(formatWait(42, "hu")).toBe("42 mp");
  });
});
