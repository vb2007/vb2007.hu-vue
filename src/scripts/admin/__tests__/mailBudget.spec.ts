import { describe, expect, it } from "vitest";
import { mailLine } from "@/scripts/admin/mailBudget";
import { aMailBudget } from "@/__tests__/helpers/admin";

describe("mailLine", () => {
  it("puts today's count on the line, with one ring where the warning and the sign-up stop meet", () => {
    expect(mailLine(aMailBudget({ sentToday: 50 }))).toEqual({
      share: 0.2,
      isFull: false,
      registrationStopped: false,
      passwordResetStopped: false,
      left: 200,
      untilRegistrationStops: 150,
      untilPasswordResetStops: 175,
      stops: [
        { kind: "registration", at: 200, reached: false },
        { kind: "warning", at: 200, reached: false },
        { kind: "passwordReset", at: 225, reached: false },
        { kind: "limit", at: 250, reached: false }
      ],
      marks: [
        { share: 0.8, reached: false },
        { share: 0.9, reached: false }
      ]
    });
  });

  it("marks each stop on its own when they're apart, in the order they come", () => {
    // MAIL_DAILY_LIMIT=7: sign-ups stop at 7 - ceil(1.4) = 5, password resets at 7 - ceil(0.7) = 6,
    // and the warning is at ceil(5.6) = 6.
    const budget = aMailBudget({
      sentToday: 1,
      dailyLimit: 7,
      warningAt: 6,
      registrationStopsAt: 5,
      passwordResetStopsAt: 6
    });
    const line = mailLine(budget);

    expect(line.stops.map((stop) => [stop.kind, stop.reached])).toEqual([
      ["registration", false],
      ["passwordReset", false],
      ["warning", false],
      ["limit", false]
    ]);
    expect(line.marks).toEqual([
      { share: 5 / 7, reached: false },
      { share: 6 / 7, reached: false }
    ]);

    const later = mailLine({ ...budget, sentToday: 5 });
    expect(later.stops.map((stop) => stop.reached)).toEqual([true, false, false, false]);
    expect(later).toMatchObject({
      registrationStopped: true,
      passwordResetStopped: false,
      untilRegistrationStops: null,
      untilPasswordResetStops: 1,
      left: 2
    });

    const latest = mailLine({ ...budget, sentToday: 6 });
    expect(latest.stops.map((stop) => stop.reached)).toEqual([true, true, true, false]);
    expect(latest).toMatchObject({
      registrationStopped: true,
      passwordResetStopped: true,
      untilPasswordResetStops: null,
      left: 1
    });
  });

  it("leaves out a stop's ring while the here ring is on top of it", () => {
    // 210 of 250 is 0.84 along: 0.04 past the ring at 200 and 0.06 short of the one at 225.
    expect(mailLine(aMailBudget({ sentToday: 210 })).marks).toEqual([]);
    // 230 is 0.92 along, 0.02 past the ring at 225.
    expect(mailLine(aMailBudget({ sentToday: 230 })).marks).toEqual([
      { share: 0.8, reached: true }
    ]);
    // 248 is 0.992 along, but the here ring stops 12px short of the terminus: 0.94 along on a
    // 200px rail, only 8px past the ring at 225.
    for (const sentToday of [240, 246, 248, 249]) {
      expect(mailLine(aMailBudget({ sentToday })).marks).toEqual([{ share: 0.8, reached: true }]);
    }
    // At the limit there's no here ring, so the rings stay.
    expect(mailLine(aMailBudget({ sentToday: 250 })).marks).toHaveLength(2);
  });

  it("gives stops a count or two apart one ring, so rings never run into each other", () => {
    // MAIL_DAILY_LIMIT=41: sign-ups stop at 41 - ceil(8.2) = 32, the warning is at ceil(32.8) = 33
    // and password resets stop at 41 - ceil(4.1) = 36.
    const budget = aMailBudget({
      sentToday: 1,
      dailyLimit: 41,
      warningAt: 33,
      registrationStopsAt: 32,
      passwordResetStopsAt: 36
    });

    expect(mailLine(budget).marks).toEqual([
      { share: 32 / 41, reached: false },
      { share: 36 / 41, reached: false }
    ]);
    expect(mailLine(budget).stops.map((stop) => stop.at)).toEqual([32, 33, 36, 41]);
    // Between its two stops the here ring is on top of the shared ring, so it's left out.
    expect(mailLine({ ...budget, sentToday: 32 }, 18.75).marks).toEqual([
      { share: 36 / 41, reached: false }
    ]);
    expect(mailLine({ ...budget, sentToday: 41 }).marks).toEqual([
      { share: 32 / 41, reached: true },
      { share: 36 / 41, reached: true }
    ]);
  });

  it("gives the rings the room they need on the rail as it's drawn, once it's measured", () => {
    const shares = (sentToday: number, railWidth: number | null) =>
      mailLine(aMailBudget({ sentToday }), railWidth).marks.map((mark) => mark.share);

    // A ring's centre keeps 1.125rem from the here ring's: half of each ring plus 0.125rem clear.
    // On a 23.3125rem rail (373px at 16px), 210 (0.84 along) is 1.4rem short of the ring at 225
    // but 0.93rem past the one at 200; 215 is the other way round.
    const desktop = 23.3125;
    expect(shares(210, desktop)).toEqual([0.9]);
    expect(shares(215, desktop)).toEqual([0.8]);
    expect(shares(240, desktop)).toEqual([0.8, 0.9]);
    // At 248 the here ring stops 0.75rem short of the terminus: 1.58rem past the ring at 225 on
    // the desktop's rail, only 0.5rem on a 12.5rem one (200px).
    expect(shares(248, desktop)).toEqual([0.8, 0.9]);
    expect(shares(248, 12.5)).toEqual([0.8]);
    // Unmeasured (or not drawn), the ring at 225 stays out of the way on any rail from 12.5rem up.
    expect(shares(212, null)).toEqual([]);
    expect(shares(240, 0)).toEqual([0.8]);
  });

  it("leaves a stop at either end to the end's own ring", () => {
    // MAIL_DAILY_LIMIT=1: the warning is at the limit, sign-ups and password resets stop at 0.
    const line = mailLine(
      aMailBudget({
        sentToday: 0,
        dailyLimit: 1,
        warningAt: 1,
        registrationStopsAt: 0,
        passwordResetStopsAt: 0
      })
    );

    expect(line.marks).toEqual([]);
    expect(line.stops.map((stop) => stop.kind)).toEqual([
      "registration",
      "passwordReset",
      "warning",
      "limit"
    ]);
    expect(line).toMatchObject({ registrationStopped: true, passwordResetStopped: true });
  });

  it("is full at the limit, and no longer reports either kind of code on its own", () => {
    const line = mailLine(aMailBudget({ sentToday: 250 }));

    expect(line).toMatchObject({
      share: 1,
      isFull: true,
      registrationStopped: false,
      passwordResetStopped: false
    });
    expect(line.stops.every((stop) => stop.reached)).toBe(true);
  });

  it("stays at the end of the line past the limit, with nothing left", () => {
    expect(mailLine(aMailBudget({ sentToday: 300 }))).toMatchObject({ share: 1, left: 0 });
  });

  it("is full from the start with a limit of 0", () => {
    const line = mailLine(
      aMailBudget({
        sentToday: 0,
        dailyLimit: 0,
        warningAt: 0,
        registrationStopsAt: 0,
        passwordResetStopsAt: 0
      })
    );

    expect(line).toMatchObject({ share: 1, isFull: true, left: 0, marks: [] });
  });
});
