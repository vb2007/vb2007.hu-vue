import { SITE_LOCALE } from "@/constants/locale";

/** "short" for a key's visible label ("57 min"), "long" for its accessible name ("57 minutes"). */
export type WaitUnits = "short" | "long";

type Unit = "second" | "minute" | "hour";

/** Below this many seconds a wait reads in seconds, so "2 min" never jumps to "1 min" and on. */
const SECONDS_SHOWN_BELOW = 120;

const unit = (value: number, name: Unit, units: WaitUnits, locale: string) =>
  new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: units }).format(value);

/**
 * A wait as it reads on a key that counts it down: seconds under two minutes ("42 sec",
 * "119 sec"), then minutes ("15 min"), then hours and minutes ("1 hr 5 min"). Past that it rounds
 * up to the minute, so it never promises less wait than there is. `units: "long"` spells the
 * units out ("1 hour 5 minutes"). `locale` defaults to the site's, which the copy around it is in.
 */
export const formatWait = (
  seconds: number,
  locale: string = SITE_LOCALE,
  units: WaitUnits = "short"
): string => {
  const whole = Math.max(0, Math.ceil(seconds));
  if (whole < SECONDS_SHOWN_BELOW) return unit(whole, "second", units, locale);

  const minutes = Math.ceil(whole / 60);
  if (minutes < 60) return unit(minutes, "minute", units, locale);

  const hours = unit(Math.floor(minutes / 60), "hour", units, locale);
  return minutes % 60 ? `${hours} ${unit(minutes % 60, "minute", units, locale)}` : hours;
};

/**
 * `spelledOut` as a waiting key's accessible name, but only when it contains the visible label
 * ("Resend in 57 minutes" for "Resend in 57 min"), so what's shown is still what names the key
 * (WCAG 2.5.3, Label in Name). Hours don't ("1 hour" for "1 hr"), so then it's undefined and the
 * visible label names the key.
 */
export const spokenWait = (visible: string, spelledOut: string): string | undefined =>
  spelledOut.includes(visible) ? spelledOut : undefined;
