import { describe, expect, it } from "vitest";
import { QUOTA_UNITS, quotaBytesFrom, quotaParts } from "@/scripts/admin/adminUser";

const { MB, GB, TB } = QUOTA_UNITS;

describe("quotaParts", () => {
  it.each([
    [10 * GB, "10", "GB"],
    [2.5 * GB, "2.5", "GB"],
    [1.5 * TB, "1.5", "TB"],
    [500 * MB, "500", "MB"],
    [0, "0", "MB"],
    [Math.round(GB / 3), "341.33", "MB"]
  ])("shows %i bytes as %s %s", (bytes, amount, unit) => {
    expect(quotaParts(bytes)).toEqual({ amount, unit });
  });
});

describe("quotaBytesFrom", () => {
  it("turns an amount in a unit into whole bytes, accepting a decimal comma", () => {
    expect(quotaBytesFrom("25", "GB")).toEqual({ bytes: 25 * GB, error: "" });
    expect(quotaBytesFrom(" 2,5 ", "GB")).toEqual({ bytes: 2.5 * GB, error: "" });
    expect(quotaBytesFrom("0.1", "MB")).toEqual({ bytes: Math.round(0.1 * MB), error: "" });
    expect(quotaBytesFrom("0", "TB")).toEqual({ bytes: 0, error: "" });
  });

  it.each(["", "  ", "lots", "-1", "Infinity"])("rejects %j", (amount) => {
    expect(quotaBytesFrom(amount, "GB")).toEqual({
      bytes: null,
      error: "Enter a size of 0 or more."
    });
  });

  it("rejects a size the API can't store", () => {
    expect(quotaBytesFrom("9000", "TB")).toEqual({
      bytes: null,
      error: "That's more than the API can store."
    });
  });
});
