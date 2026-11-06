import type { MailBudgetResponse } from "@/types/api/admin";

/** What happens at a stop on the day's mail line: sign-up codes stop, a warning is logged, or all mail stops. */
export type MailStopKind = "registration" | "warning" | "limit";

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
  /** Mails that can still go out today. */
  left: number;
  /** Mails until sign-up codes stop, or `null` once they have. */
  untilRegistrationStops: number | null;
  /** Every stop, in the order they come along the line, the limit last. */
  stops: MailStop[];
  /** The rings on the rail between the ends, one per place even when two stops share it. */
  marks: { share: number; reached: boolean }[];
}

/**
 * How close (as a share of the line) a stop's ring may come to the "here" ring before it's left
 * out, so the two never merge into one blob; the stops in words still name it. Their centres
 * need 16px between them (half of the 18px here ring plus half of the 14px stop ring), which
 * 7 % keeps on a rail down to about 230px: the narrowest phone's (the Pixel 7's is 291px).
 */
export const MARK_GAP = 0.07;

const ORDER: MailStopKind[] = ["registration", "warning", "limit"];

/** Lays today's mail out as a line from 0 to the daily limit, with its stops. */
export const mailLine = (budget: MailBudgetResponse): MailLine => {
  const { sentToday, dailyLimit, warningAt, registrationStopsAt } = budget;
  const isFull = sentToday >= dailyLimit;
  const share = dailyLimit > 0 ? Math.min(1, sentToday / dailyLimit) : 1;
  const at: Record<MailStopKind, number> = {
    registration: registrationStopsAt,
    warning: warningAt,
    limit: dailyLimit
  };
  const stops = ORDER.map((kind) => ({ kind, at: at[kind], reached: sentToday >= at[kind] })).sort(
    (a, b) => a.at - b.at
  );
  // A stop at 0 or at the limit sits on an end ring, which already marks it.
  const marks = [...new Set([registrationStopsAt, warningAt])]
    .filter((count) => count > 0 && count < dailyLimit)
    .sort((a, b) => a - b)
    .map((count) => ({ share: count / dailyLimit, reached: sentToday >= count }))
    // At the limit there's no "here" ring for them to run into.
    .filter((mark) => isFull || Math.abs(mark.share - share) >= MARK_GAP);

  return {
    share,
    isFull,
    registrationStopped: !isFull && sentToday >= registrationStopsAt,
    left: Math.max(0, dailyLimit - sentToday),
    untilRegistrationStops:
      sentToday < registrationStopsAt ? registrationStopsAt - sentToday : null,
    stops,
    marks
  };
};
