const unit = (value: number, name: "second" | "minute" | "hour", locale?: string) =>
  new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "short" }).format(value);

/**
 * A wait as it reads on a key that counts it down: seconds under a minute ("42 sec"), then
 * minutes ("15 min"), then hours and minutes ("1 hr 5 min"). Past a minute it rounds up, so it
 * never promises less wait than there is. `locale` defaults to the browser's.
 */
export const formatWait = (seconds: number, locale?: string): string => {
  const whole = Math.max(0, Math.ceil(seconds));
  if (whole < 60) return unit(whole, "second", locale);

  const minutes = Math.ceil(whole / 60);
  if (minutes < 60) return unit(minutes, "minute", locale);

  const hours = unit(Math.floor(minutes / 60), "hour", locale);
  return minutes % 60 ? `${hours} ${unit(minutes % 60, "minute", locale)}` : hours;
};
