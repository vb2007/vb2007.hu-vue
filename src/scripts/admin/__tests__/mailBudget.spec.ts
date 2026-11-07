import { describe, expect, it } from "vitest";
import { mailLine } from "@/scripts/admin/mailBudget";
import { aMailBudget } from "@/__tests__/helpers/admin";

describe("mailLine", () => {
  it("puts today's count on the line, with one ring where the warning and the sign-up stop meet", () => {
    expect(mailLine(aMailBudget({ sentToday: 50 }))).toEqual({
      share: 0.2,
      isFull: false,
      registrationStopped: false,
      left: 200,
      untilRegistrationStops: 150,
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
    const budget = aMailBudget({
      sentToday: 1,
      dailyLimit: 7,
      warningAt: 6,
      registrationStopsAt: 5
    });
    const line = mailLine(budget);

    expect(line.stops.map((stop) => [stop.kind, stop.reached])).toEqual([
      ["registration", false],
      ["warning", false],
      ["limit", false]
    ]);
    expect(line.marks).toEqual([
      { share: 5 / 7, reached: false },
      { share: 6 / 7, reached: false }
    ]);

    const later = mailLine({ ...budget, sentToday: 5 });
    expect(later.stops.map((stop) => stop.reached)).toEqual([true, false, false]);
    expect(later).toMatchObject({
      registrationStopped: true,
      untilRegistrationStops: null,
      left: 2
    });
  });

  it("leaves out a stop's ring while the here ring is on top of it", () => {
    // 210 of 250 is 0.84 along, 0.04 past the ring at 200.
    expect(mailLine(aMailBudget({ sentToday: 210 })).marks).toEqual([]);
    expect(mailLine(aMailBudget({ sentToday: 230 })).marks).toEqual([
      { share: 0.8, reached: true }
    ]);
    // At the limit there's no here ring, so the ring stays.
    expect(mailLine(aMailBudget({ sentToday: 250 })).marks).toHaveLength(1);
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

  it("stays at the end of the line past the limit, with nothing left", () => {
    expect(mailLine(aMailBudget({ sentToday: 300 }))).toMatchObject({ share: 1, left: 0 });
  });

  it("is full from the start with a limit of 0", () => {
    const line = mailLine(
      aMailBudget({ sentToday: 0, dailyLimit: 0, warningAt: 0, registrationStopsAt: 0 })
    );

    expect(line).toMatchObject({ share: 1, isFull: true, left: 0, marks: [] });
  });
});
