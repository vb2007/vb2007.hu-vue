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

/**
 * How far short of the terminus the here ring stops, in px, as `.mail__here` draws it (0.75rem),
 * so a nearly full line doesn't swallow it.
 */
const HERE_INSET = 12;

/**
 * How close (as a share of the line) a stop's ring may come to the "here" ring, or to the ring
 * before it, before it's left out, so rings never merge into one blob; the stops in words still
 * name it. A stop ring and the here ring need 16px between their centres (half of the 18px here
 * ring plus half of the 14px stop ring), two stop rings 14px: 16px of the narrowest rail is 8 %,
 * and more on any wider one.
 */
export const MARK_GAP = 16 / NARROWEST_RAIL;

/** How far a mark is from the stretch of line `[from, to]`, as a share of the line. */
const distance = (mark: number, from: number, to: number): number =>
  mark < from ? from - mark : Math.max(0, mark - to);

/** Stops on the same count are listed in this order. */
const ORDER: MailStopKind[] = ["registration", "passwordReset", "warning", "limit"];

const until = (count: number, sentToday: number): number | null =>
  sentToday < count ? count - sentToday : null;

/** Lays today's mail out as a line from 0 to the daily limit, with its stops. */
export const mailLine = (budget: MailBudgetResponse): MailLine => {
  const { sentToday, dailyLimit, warningAt, registrationStopsAt, passwordResetStopsAt } = budget;
  const isFull = sentToday >= dailyLimit;
  const share = dailyLimit > 0 ? Math.min(1, sentToday / dailyLimit) : 1;
  // Near the limit the here ring is drawn short of its count, the further the narrower the rail:
  // on any rail from the narrowest up, it sits somewhere from here to its true place.
  const hereFrom = Math.min(share, 1 - HERE_INSET / NARROWEST_RAIL);
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
    // On a small limit, stops a count or two apart share the first one's ring.
    .reduce<MailLine["marks"]>((kept, mark) => {
      const last = kept[kept.length - 1];
      return last && mark.share - last.share < MARK_GAP ? kept : [...kept, mark];
    }, [])
    // At the limit there's no "here" ring for them to run into.
    .filter((mark) => isFull || distance(mark.share, hereFrom, share) >= MARK_GAP);

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
