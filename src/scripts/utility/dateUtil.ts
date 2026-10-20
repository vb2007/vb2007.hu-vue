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
