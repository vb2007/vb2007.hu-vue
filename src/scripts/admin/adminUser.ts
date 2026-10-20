import type { SortOrder } from "@/scripts/pastebin/paste";

export type AdminUserSortBy = "usedBytes" | "username" | "createdAt";

/** A user as the admin list returns it (vb2007/vb2007.hu-api#120). */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isSuperuser: boolean;
  uploads: {
    usedBytes: number;
    count: number;
    quotaBytes: number;
    /** False while the user is on the default quota. */
    hasCustomQuota: boolean;
  };
}

export type { SortOrder };

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
    return { bytes: null, error: "Enter a size of 0 or more." };
  }
  const bytes = Math.round(value * QUOTA_UNITS[unit]);
  if (bytes > Number.MAX_SAFE_INTEGER) {
    return { bytes: null, error: "That's more than the API can store." };
  }
  return { bytes, error: "" };
};
