export const getCurrentYear = (): number => {
  return new Date().getFullYear();
};

/** A readable date and time, e.g. for when a paste was added. `locale` defaults to the browser's. */
export const formatDateTime = (iso: string, locale?: string): string => {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(iso)
  );
};

/** A readable date without the time, e.g. when an account was created. `locale` defaults to the browser's. */
export const formatDate = (iso: string, locale?: string): string => {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
};

/** Whether the moment `iso` names has come, e.g. a pending registration's expiry. */
export const isPast = (iso: string, now = Date.now()): boolean => Date.parse(iso) <= now;

/** A short time of day, e.g. when a link expires within the hour. `locale` defaults to the browser's. */
export const formatTime = (ms: number, locale?: string): string => {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(new Date(ms));
};
