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
