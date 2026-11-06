import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";

export type AdminUserSortBy = "usedBytes" | "username" | "createdAt";

/** A user as the admin list returns it (vb2007/vb2007.hu-api#120). */
export interface AdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isSuperuser: boolean;
  /** When the user was suspended, or `null` while they aren't (vb2007/vb2007.hu-api#273). */
  suspendedAt: string | null;
  uploads: {
    usedBytes: number;
    count: number;
    quotaBytes: number;
    /** False while the user is on the default quota. */
    hasCustomQuota: boolean;
  };
}

/** `GET /admin/users/:id` (vb2007/vb2007.hu-api#272): one user with their logins and content. */
export interface AdminUserDetails extends AdminUser {
  /** False for an account that only logs in with GitHub. */
  hasPassword: boolean;
  emailVerified: boolean;
  /** The new address while an unexpired change waits for its code. */
  pendingEmail: string | null;
  /** The linked GitHub account's login. */
  githubLogin: string | null;
  /** How much the user owns; `uploads` is the same as `uploads.count`. */
  counts: { pastes: number; shortUrls: number; uploads: number };
}

/** `GET /admin/users/:id` */
export interface AdminUserResponse {
  user: AdminUserDetails;
}

/** `GET /admin/users` */
export type AdminUserListQuery = ListQuery<AdminUserSortBy> & {
  /** Matches part of the username or the e-mail address, whatever its case. */
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

/** `PATCH /admin/users/:id` (vb2007/vb2007.hu-api#274): 2 to 16 characters once trimmed. */
export interface RenameUserBody {
  username: string;
}

/** `PATCH /admin/users/:id` */
export interface RenameUserResponse extends MessageResponse {
  user: AdminUser;
}

/**
 * `POST /admin/users/:id/logout` (vb2007/vb2007.hu-api#275): ends the account's session, and so the
 * superuser's own when it's their account. Also a 200 when they weren't logged in.
 */
export interface LogoutUserResponse extends MessageResponse {
  user: { id: string; username: string };
}
