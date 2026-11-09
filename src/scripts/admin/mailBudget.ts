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
  /** Sign-up codes are refused, while other mail still goes out. */
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

/**
 * How close (as a share of the line) a stop's ring may come to the "here" ring, or to the ring
 * before it, before it's left out, so rings never merge into one blob; the stops in words still
 * name it. A stop ring and the here ring need 16px between their centres (half of the 18px here
 * ring plus half of the 14px stop ring), two stop rings 14px, which 8 % keeps on a rail down to
 * 200px: the rail on a 320px screen (the Pixel 7's is 291px).
 */
export const MARK_GAP = 0.08;

/** Stops on the same count are listed in this order. */
const ORDER: MailStopKind[] = ["registration", "passwordReset", "warning", "limit"];

const until = (count: number, sentToday: number): number | null =>
  sentToday < count ? count - sentToday : null;

/** Lays today's mail out as a line from 0 to the daily limit, with its stops. */
export const mailLine = (budget: MailBudgetResponse): MailLine => {
  const { sentToday, dailyLimit, warningAt, registrationStopsAt, passwordResetStopsAt } = budget;
  const isFull = sentToday >= dailyLimit;
  const share = dailyLimit > 0 ? Math.min(1, sentToday / dailyLimit) : 1;
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
    .filter((mark) => isFull || Math.abs(mark.share - share) >= MARK_GAP);

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
