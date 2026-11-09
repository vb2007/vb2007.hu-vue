import type { MailBudgetResponse } from "@/types/api/admin";

/**
 * What happens at a stop on the day's mail line: sign-up codes stop, password reset codes stop, a
 * warning is logged, or all mail stops.
 */
export type MailStopKind = "registration" | "passwordReset" | "warning" | "limit";

export interface MailStop {
  kind: MailStopKind;
  /** The count it's at. */
  at: number;
  /** Today's count is at it or past it. */
  reached: boolean;
}

export interface MailLine {
  /** How far along the line today's count is, from 0 to 1. */
  share: number;
  /** Nothing more goes out today. */
  isFull: boolean;
  /** Sign-up codes are refused, while mail to existing accounts still goes out. */
  registrationStopped: boolean;
  /** Password reset codes are refused too, while e-mail change codes and notices still go out. */
  passwordResetStopped: boolean;
  /** Mails that can still go out today. */
  left: number;
  /** Mails until sign-up codes stop, or `null` once they have. */
  untilRegistrationStops: number | null;
  /** Mails until password reset codes stop, or `null` once they have. */
  untilPasswordResetStops: number | null;
  /** Every stop, in the order they come along the line, the limit last. */
  stops: MailStop[];
  /** The rings on the rail between the ends, one per place even when two stops share it. */
  marks: { share: number; reached: boolean }[];
}

/** The narrowest rail the line is drawn on, in px: a 320px screen's (the Pixel 7's is 291px). */
const NARROWEST_RAIL = 200;
/** How far short of the terminus `.mail__here` stops (0.75rem), so a nearly full line doesn't swallow it. */
const HERE_INSET = 12;
/** The least run `.mail__line--some` draws once anything is sent (0.25rem). */
const LEAST_RUN = 4;
/** The px between the here ring's centre and a stop ring's: half of the 18px ring plus half of the 14px one. */
const HERE_CLEARANCE = 16;
/** The px between two stop rings' centres: a 14px ring's width. */
const MARK_CLEARANCE = 14;

/** Stops on the same count are listed in this order. */
const ORDER: MailStopKind[] = ["registration", "passwordReset", "warning", "limit"];

const until = (count: number, sentToday: number): number | null =>
  sentToday < count ? count - sentToday : null;

/** How far a mark is from the stretch of line `[from, to]`, as a share of the line. */
const distance = (mark: number, from: number, to: number): number =>
  mark < from ? from - mark : Math.max(0, mark - to);

/**
 * Lays today's mail out as a line from 0 to the daily limit, with its stops. `railWidth` is the
 * rail's width in px as drawn, which decides which stop rings have room beside the here ring.
 * Before it's measured (`null` or 0), rings get the room they'd need on any rail from the
 * narrowest up.
 */
export const mailLine = (budget: MailBudgetResponse, railWidth: number | null = null): MailLine => {
  const { sentToday, dailyLimit, warningAt, registrationStopsAt, passwordResetStopsAt } = budget;
  const isFull = sentToday >= dailyLimit;
  const share = dailyLimit > 0 ? Math.min(1, sentToday / dailyLimit) : 1;
  const measured = railWidth !== null && railWidth > 0;
  const rail = measured ? railWidth : NARROWEST_RAIL;
  // Where the here ring is drawn: never short of the least run, and short of the terminus.
  const drawn = Math.min(
    sentToday > 0 ? Math.max(share, LEAST_RUN / rail) : share,
    1 - HERE_INSET / rail
  );
  // Unmeasured, it's somewhere between its true place (a wide rail) and that (the narrowest).
  const [hereFrom, hereTo] = measured
    ? [drawn, drawn]
    : [Math.min(share, drawn), Math.max(share, drawn)];
  const at: Record<MailStopKind, number> = {
    registration: registrationStopsAt,
    passwordReset: passwordResetStopsAt,
    warning: warningAt,
    limit: dailyLimit
  };
  const stops = ORDER.map((kind) => ({ kind, at: at[kind], reached: sentToday >= at[kind] })).sort(
    (a, b) => a.at - b.at
  );
  // A stop at 0 or at the limit sits on an end ring, which already marks it.
  const marks = [...new Set([registrationStopsAt, passwordResetStopsAt, warningAt])]
    .filter((count) => count > 0 && count < dailyLimit)
    .sort((a, b) => a - b)
    .map((count) => ({ share: count / dailyLimit, reached: sentToday >= count }))
    // Stops too close for two rings share the first one's. While the count is between them, the
    // here ring is too close to show it, so it's only drawn with all its stops reached or none.
    .reduce<MailLine["marks"]>((kept, mark) => {
      const last = kept[kept.length - 1];
      return last && (mark.share - last.share) * rail < MARK_CLEARANCE ? kept : [...kept, mark];
    }, [])
    // A ring too close to the here ring is left out while it's there; the stops in words still
    // name it. At the limit there's no here ring for them to run into.
    .filter((mark) => isFull || distance(mark.share, hereFrom, hereTo) * rail >= HERE_CLEARANCE);

  return {
    share,
    isFull,
    registrationStopped: !isFull && sentToday >= registrationStopsAt,
    passwordResetStopped: !isFull && sentToday >= passwordResetStopsAt,
    left: Math.max(0, dailyLimit - sentToday),
    untilRegistrationStops: until(registrationStopsAt, sentToday),
    untilPasswordResetStops: until(passwordResetStopsAt, sentToday),
    stops,
    marks
  };
};
