const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

/**
 * A readable file size in binary steps (1 KB = 1024 bytes, like the API's MB limits), e.g. "4.2 MB".
 * `locale` defaults to the browser's.
 */
export const formatBytes = (bytes: number, locale?: string): string => {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: UNITS[unit],
    // "9 bytes" rather than "9 byte"; the larger units read better short ("4.2 MB").
    unitDisplay: unit === 0 ? "long" : "short",
    maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1
  }).format(value);
};
