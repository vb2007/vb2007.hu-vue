import { Messages } from "@/constants/messages";

export type QuotaUnit = "MB" | "GB" | "TB";

/** Binary steps, like the API's MB settings and `formatBytes`. */
export const QUOTA_UNITS: Record<QuotaUnit, number> = {
  MB: 1024 ** 2,
  GB: 1024 ** 3,
  TB: 1024 ** 4
};

/** A quota as the amount and unit the editor starts from: the largest unit it fills at least once. */
export const quotaParts = (bytes: number): { amount: string; unit: QuotaUnit } => {
  const unit = bytes >= QUOTA_UNITS.TB ? "TB" : bytes >= QUOTA_UNITS.GB ? "GB" : "MB";
  const amount = Math.round((bytes / QUOTA_UNITS[unit]) * 100) / 100;
  return { amount: String(amount), unit };
};

/**
 * The bytes an entered quota stands for, or an error message when it can't be one. Decimals are
 * fine ("2.5" GB); the result is rounded to whole bytes, as the API wants an integer.
 */
export const quotaBytesFrom = (
  amount: string,
  unit: QuotaUnit
): { bytes: number; error: "" } | { bytes: null; error: string } => {
  const value = Number(amount.trim().replace(",", "."));
  if (!amount.trim() || !Number.isFinite(value) || value < 0) {
    return { bytes: null, error: Messages.Admin.invalidQuota };
  }
  const bytes = Math.round(value * QUOTA_UNITS[unit]);
  if (bytes > Number.MAX_SAFE_INTEGER) {
    return { bytes: null, error: Messages.Admin.quotaTooLarge };
  }
  return { bytes, error: "" };
};
