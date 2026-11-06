import { describe, expect, it } from "vitest";
import { mailLine } from "@/scripts/admin/mailBudget";
import { aMailBudget } from "@/__tests__/helpers/admin";

describe("mailLine", () => {
  it("puts today's count on the line, with one ring where the warning and the sign-up stop meet", () => {
    expect(mailLine(aMailBudget({ sentToday: 50 }))).toEqual({
      share: 0.2,
      isFull: false,
      registrationStopped: false,
      stops: [
        { kind: "registration", at: 200, reached: false },
        { kind: "warning", at: 200, reached: false },
        { kind: "limit", at: 250, reached: false }
      ],
      marks: [{ share: 0.8, reached: false }]
    });
  });

  it("marks each stop on its own when they're apart, in the order they come", () => {
    // MAIL_DAILY_LIMIT=7: the warning at ceil(5.6) = 6, sign-ups stop at 7 - ceil(1.4) = 5.
    const line = mailLine(
      aMailBudget({ sentToday: 6, dailyLimit: 7, warningAt: 6, registrationStopsAt: 5 })
    );

    expect(line.stops.map((stop) => [stop.kind, stop.reached])).toEqual([
      ["registration", true],
      ["warning", true],
      ["limit", false]
    ]);
    expect(line.marks).toEqual([
      { share: 5 / 7, reached: true },
      { share: 6 / 7, reached: true }
    ]);
    expect(line.registrationStopped).toBe(true);
  });

  it("leaves a stop at either end to the end's own ring", () => {
    // MAIL_DAILY_LIMIT=1: the warning is at the limit and sign-ups stop at 0.
    const line = mailLine(
      aMailBudget({ sentToday: 0, dailyLimit: 1, warningAt: 1, registrationStopsAt: 0 })
    );

    expect(line.marks).toEqual([]);
    expect(line.stops.map((stop) => stop.kind)).toEqual(["registration", "warning", "limit"]);
    expect(line.registrationStopped).toBe(true);
  });

  it("is full at the limit, and no longer reports sign-ups on their own", () => {
    const line = mailLine(aMailBudget({ sentToday: 250 }));

    expect(line).toMatchObject({ share: 1, isFull: true, registrationStopped: false });
    expect(line.stops.every((stop) => stop.reached)).toBe(true);
  });

  it("stays at the end of the line past the limit", () => {
    expect(mailLine(aMailBudget({ sentToday: 300 })).share).toBe(1);
  });
});
