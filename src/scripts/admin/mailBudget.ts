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
  /** Every stop, in the order they come along the line, the limit last. */
  stops: MailStop[];
  /** The rings on the rail between the ends, one per place even when two stops share it. */
  marks: { share: number; reached: boolean }[];
}

const ORDER: MailStopKind[] = ["registration", "warning", "limit"];

/** Lays today's mail out as a line from 0 to the daily limit, with its stops. */
export const mailLine = (budget: MailBudgetResponse): MailLine => {
  const { sentToday, dailyLimit, warningAt, registrationStopsAt } = budget;
  const isFull = sentToday >= dailyLimit;
  const at: Record<MailStopKind, number> = {
    registration: registrationStopsAt,
    warning: warningAt,
    limit: dailyLimit
  };
  const stops = ORDER.map((kind) => ({ kind, at: at[kind], reached: sentToday >= at[kind] })).sort(
    (a, b) => a.at - b.at
  );
  // A stop at 0 or at the limit sits on an end ring, which already marks it.
  const places = [...new Set([registrationStopsAt, warningAt])]
    .filter((count) => count > 0 && count < dailyLimit)
    .sort((a, b) => a - b);

  return {
    share: Math.min(1, sentToday / dailyLimit),
    isFull,
    registrationStopped: !isFull && sentToday >= registrationStopsAt,
    stops,
    marks: places.map((count) => ({ share: count / dailyLimit, reached: sentToday >= count }))
  };
};
