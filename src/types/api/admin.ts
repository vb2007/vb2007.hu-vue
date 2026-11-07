import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";
import type { PasteSortBy } from "@/types/api/pastebin";
import type { OwnShortUrl, ShortUrlSortBy } from "@/types/api/shortener";
import type { Upload, UploadOwner, UploadSortBy } from "@/types/api/uploads";

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

/** `PATCH /admin/users/:id/suspension` (vb2007/vb2007.hu-api#273) */
export interface SetSuspensionBody {
  /** `true` suspends the user and ends their session; `false` lifts the suspension. */
  suspended: boolean;
}

/** `PATCH /admin/users/:id/suspension` */
export interface SuspensionResponse extends MessageResponse {
  user: AdminUser;
}

/** A paste as `GET /admin/pastes` lists it (vb2007/vb2007.hu-api#277). */
export interface AdminPaste {
  id: string;
  /** A PASTE_LANGUAGES id, or `null` for a paste without one (plain text). */
  language: string | null;
  /** The paste's first 100 characters (code points); the rest stays on `GET /paste/:id`. */
  preview: string;
  addedOn: string;
  /** `null` once the owner's account no longer exists. */
  owner: UploadOwner | null;
}

/** `GET /admin/pastes` */
export type AdminPasteListQuery = ListQuery<PasteSortBy> & {
  /** Matches part of the owner's username or of the language id, whatever its case. */
  q?: string;
};

/** `GET /admin/pastes` */
export interface AdminPastesResponse {
  pastes: AdminPaste[];
  pagination: Pagination<PasteSortBy>;
}

/** A short link as `GET /admin/short-urls` lists it (vb2007/vb2007.hu-api#279). */
export interface AdminShortUrl extends OwnShortUrl {
  /** `null` once the owner's account no longer exists. */
  owner: UploadOwner | null;
}

/** `GET /admin/short-urls` */
export type AdminShortUrlListQuery = ListQuery<ShortUrlSortBy> & {
  /** Matches part of the code, the target or the owner's username, whatever its case. */
  q?: string;
};

/** `GET /admin/short-urls` */
export interface AdminShortUrlsResponse {
  shortUrls: AdminShortUrl[];
  pagination: Pagination<ShortUrlSortBy>;
}

/** An upload in the admin's site-wide list, with whose it is (vb2007/vb2007.hu-api#280). */
export interface AdminUpload extends Upload {
  /** `null` once the owner's account no longer exists. */
  owner: UploadOwner | null;
}

/** `GET /admin/uploads`: every user's uploads, private ones included. Takes `UploadListQuery`. */
export interface AdminUploadsResponse {
  uploads: AdminUpload[];
  pagination: Pagination<UploadSortBy>;
}
