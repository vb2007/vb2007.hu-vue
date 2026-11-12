import type {
  BasePagination,
  ListQuery,
  MessageResponse,
  PageQuery,
  Pagination
} from "@/types/api/common";
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
  /** The new address while a change waits for its code: null once it expired or its tries ran out. */
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
  /**
   * Matches part of the owner's username or of the language id, whatever its case. The owner part
   * only covers the 100 shortest usernames containing `q` (see `UploadListQuery.q`).
   */
  q?: string;
};

/**
 * `GET /admin/pastes`. Without `q`, `pagination.total` is an estimate from the collection's count
 * metadata, exact apart from right after an unclean database shutdown.
 */
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
  /**
   * Matches part of the code, the target or the owner's username, whatever its case. The owner part
   * only covers the 100 shortest usernames containing `q` (see `UploadListQuery.q`).
   */
  q?: string;
};

/** `GET /admin/short-urls`. Without `q`, `pagination.total` is an estimate, as on the pastes. */
export interface AdminShortUrlsResponse {
  shortUrls: AdminShortUrl[];
  pagination: Pagination<ShortUrlSortBy>;
}

/** An upload in the admin's site-wide list, with whose it is (vb2007/vb2007.hu-api#280). */
export interface AdminUpload extends Upload {
  /** `null` once the owner's account no longer exists. */
  owner: UploadOwner | null;
}

/**
 * `GET /admin/uploads`: every user's uploads, private ones included. Takes `UploadListQuery`.
 * Without `q` and `visibility`, `pagination.total` is an estimate, as on the pastes.
 */
export interface AdminUploadsResponse {
  uploads: AdminUpload[];
  pagination: Pagination<UploadSortBy>;
}

/** A sign-up waiting for its code (vb2007/vb2007.hu-api#283): only the address is known yet. */
export interface AdminPendingRegistration {
  id: string;
  email: string;
  /** 24 hours after the last `POST /auth/register` for the address. The API lists no later one. */
  expiresAt: string;
}

/** `GET /admin/pending-registrations`: no sort, the newest `expiresAt` first. */
export type PendingRegistrationListQuery = PageQuery & {
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
 * keyed by the e-mail, the IP, or both (`loginPerAccount`). The last five are keyed by the e-mail
 * only (vb2007/vb2007.hu-api#384): the account's own limiters, and the stored daily wrong-code
 * counts of the account or of a registration waiting for the address.
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
  | "accountCodeChecksPerAccount"
  | "passwordChecksPerIp"
  | "passwordChecksPerAccount"
  | "passwordResetCodeFailures"
  | "emailChangeCodeFailures"
  | "registrationCodeFailures";

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

/**
 * `GET /admin/stats` (vb2007/vb2007.hu-api#281): the site's totals and its upload settings. The
 * `users`, `pastes` and `shortUrls` totals are estimates from the collections' count metadata,
 * exact apart from right after an unclean database shutdown.
 */
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
  /**
   * From it, registration codes and their resends are refused; password reset codes go on until
   * `passwordResetStopsAt`, other mail to existing accounts up to the limit.
   */
  registrationStopsAt: number;
  /**
   * From it, password reset codes are refused too (vb2007/vb2007.hu-api#322); e-mail change codes
   * and the notices go on. It's the limit less a tenth, at or after `registrationStopsAt`.
   */
  passwordResetStopsAt: number;
  /** The next UTC midnight, when `sentToday` starts again from 0. */
  resetsAt: string;
}
