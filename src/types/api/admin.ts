import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";

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

/** `GET /admin/users` */
export type AdminUserListQuery = ListQuery<AdminUserSortBy> & {
  /** Searches the users. */
  q?: string;
};

/** `GET /admin/users` */
export interface AdminUsersResponse {
  users: AdminUser[];
  pagination: Pagination<AdminUserSortBy>;
}

/** `PATCH /admin/users/:id/upload-quota` (vb2007/vb2007.hu-api#121) */
export interface SetUploadQuotaBody {
  /** Whole bytes, or `null` for the default quota. */
  quotaBytes: number | null;
}

/** `PATCH /admin/users/:id/upload-quota` */
export interface UploadQuotaResponse extends MessageResponse {
  user: AdminUser;
}

/** `GET /admin/stats` (vb2007/vb2007.hu-api#281): the site's totals and its upload settings. */
export interface AdminStatsResponse {
  /** Every account, the superuser's included. */
  users: number;
  pastes: number;
  shortUrls: number;
  uploads: {
    total: number;
    public: number;
    /** Uploads without a stored visibility count as private, like everywhere else. */
    private: number;
    /** The sum of every upload's file size. */
    storedBytes: number;
  };
  /** Sign-ups waiting for their e-mail code whose registration hasn't expired yet. */
  pendingRegistrations: number;
  settings: {
    /** The quota of users without one of their own. */
    defaultUploadQuotaBytes: number;
    /** The largest file one upload takes. */
    maxFileSizeBytes: number;
  };
}

/**
 * `GET /admin/mail-budget` (vb2007/vb2007.hu-api#282): today's mail as this API process counts it,
 * since the last UTC midnight or its last restart, whichever is later.
 */
export interface MailBudgetResponse {
  sentToday: number;
  /** At it, every mail is refused. */
  dailyLimit: number;
  /** From it, the API logs a warning, once a day. */
  warningAt: number;
  /** From it, registration codes and their resends are refused; mail to existing accounts goes on. */
  registrationStopsAt: number;
  /** The next UTC midnight, when `sentToday` starts again from 0. */
  resetsAt: string;
}
