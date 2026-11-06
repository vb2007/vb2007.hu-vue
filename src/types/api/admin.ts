import type { BasePagination, ListQuery, MessageResponse, Pagination } from "@/types/api/common";

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

/** A sign-up waiting for its code (vb2007/vb2007.hu-api#283): only the address is known yet. */
export interface AdminPendingRegistration {
  id: string;
  email: string;
  /** 24 hours after the last `POST /auth/register` for the address. Still listed once it passed. */
  expiresAt: string;
}

/** `GET /admin/pending-registrations`: no sort, the newest `expiresAt` first. */
export type PendingRegistrationListQuery = {
  limit: number;
  page: number;
  /** Part of the e-mail address. */
  q?: string;
};

/** `GET /admin/pending-registrations` */
export interface PendingRegistrationsResponse {
  pendingRegistrations: AdminPendingRegistration[];
  pagination: BasePagination;
}

/**
 * The API's rate limiters (vb2007/vb2007.hu-api#284), in the order `cleared` lists them. Each is
 * keyed by the e-mail, the IP, or both (`loginPerAccount`).
 */
export type RateLimitName =
  | "loginPerIp"
  | "loginPerAccount"
  | "loginPerEmail"
  | "codeChecksPerIp"
  | "codeChecksPerEmail"
  | "resetLinkChecksPerIp"
  | "mailSendsPerIp"
  | "usernameChecksPerIp"
  | "accountCodeChecksPerIp"
  | "passwordChecksPerIp";

/** `DELETE /admin/rate-limits`: at least one of the two. */
export interface ClearRateLimitsBody {
  email?: string;
  ip?: string;
}

/** `DELETE /admin/rate-limits` */
export interface ClearRateLimitsResponse extends MessageResponse {
  /** The limiters that were counting for the key and are emptied now; empty when none was. */
  cleared: RateLimitName[];
}
