import { HttpMethod } from "@/constants/http";
import { defineEndpoint, type NoBody } from "@/scripts/api/endpoint";
import type {
  AdminUserListQuery,
  AdminUsersResponse,
  ClearRateLimitsBody,
  ClearRateLimitsResponse,
  PendingRegistrationListQuery,
  PendingRegistrationsResponse,
  SetUploadQuotaBody,
  UploadQuotaResponse
} from "@/types/api/admin";
import type {
  EmailBody,
  GithubLinkResponse,
  GithubPasswordBody,
  LoginBody,
  PasswordResetConfirmBody,
  PasswordResetLinkBody,
  RegisterBody,
  RegisterVerifyBody,
  UsernameAvailableQuery,
  UsernameAvailableResponse
} from "@/types/api/auth";
import type { MessageResponse } from "@/types/api/common";
import type {
  CreatePasteBody,
  PasteDeletedResponse,
  PasteListQuery,
  PasteResponse,
  PasteSavedResponse,
  PastesResponse,
  UpdatePasteBody
} from "@/types/api/pastebin";
import type {
  ShortenUrlBody,
  ShortenUrlResponse,
  ShortUrlLookupResponse
} from "@/types/api/shortener";
import type {
  UpdateUploadBody,
  UploadDeletedResponse,
  UploadFileFields,
  UploadListQuery,
  UploadResponse,
  UploadSavedResponse,
  UploadsResponse,
  UploadUsage
} from "@/types/api/uploads";
import type {
  ChangeEmailBody,
  ChangePasswordBody,
  ConfirmEmailBody,
  DeleteUserBody,
  SetPasswordBody,
  UserDetails
} from "@/types/api/user";

/** Baked in at build time; tests pin it to `https://api.test`. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

/**
 * Every API route the site calls, grouped like the API's routers, one entry per method and path.
 * Paths are written like the API's Express routes, so they can be checked against them as is.
 */
export class Endpoints {
  static readonly Auth = class {
    static readonly register = defineEndpoint<RegisterBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/register",
      credentials: false
    });
    /** Sends the registration code again (vb2007/vb2007.hu-api#30). */
    static readonly registerResend = defineEndpoint<EmailBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/register/resend",
      credentials: false
    });
    /** The e-mailed code finishes registering and starts a session (vb2007/vb2007.hu-api#28). */
    static readonly registerVerify = defineEndpoint<RegisterVerifyBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/register/verify",
      credentials: true
    });
    /** `?username=` says whether a username is free (vb2007/vb2007.hu-api#233). */
    static readonly usernameAvailable = defineEndpoint<
      undefined,
      UsernameAvailableResponse,
      UsernameAvailableQuery
    >()({
      method: HttpMethod.Get,
      path: "/auth/username-available",
      credentials: false
    });
    static readonly login = defineEndpoint<LoginBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/login",
      credentials: true
    });
    static readonly logout = defineEndpoint<undefined, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/logout",
      credentials: true,
      redirect: "manual"
    });
    /** E-mails a password reset code (vb2007/vb2007.hu-api#163). */
    static readonly passwordReset = defineEndpoint<EmailBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/auth/password-reset",
      credentials: false
    });
    /** The code with the new password (vb2007/vb2007.hu-api#163). */
    static readonly passwordResetConfirm = defineEndpoint<
      PasswordResetConfirmBody,
      MessageResponse
    >()({
      method: HttpMethod.Post,
      path: "/auth/password-reset/confirm",
      credentials: false
    });
    /** The mailed link's token with the new password (vb2007/vb2007.hu-api#256). */
    static readonly passwordResetConfirmLink = defineEndpoint<
      PasswordResetLinkBody,
      MessageResponse
    >()({
      method: HttpMethod.Post,
      path: "/auth/password-reset/confirm-link",
      credentials: false
    });
    /** GitHub login (vb2007/vb2007.hu-api#128): a browser navigation, not a fetch call. */
    static readonly github = defineEndpoint()({
      method: HttpMethod.Get,
      path: "/auth/github",
      credentials: false
    });
    /**
     * Relinks GitHub on an account without a password, so GitHub confirms it's them before they set
     * one (vb2007/vb2007.hu-api#183): a browser navigation, not a fetch call. An account with a
     * password comes back with `?oauthError=passwordRequired` (#243) and links with `githubStartLink`.
     */
    static readonly githubLink = defineEndpoint()({
      method: HttpMethod.Get,
      path: "/auth/github/link",
      credentials: true
    });
    /**
     * Starts linking GitHub (vb2007/vb2007.hu-api#243): an account with a password sends it, and
     * gets back the GitHub URL to navigate to.
     */
    static readonly githubStartLink = defineEndpoint<
      GithubPasswordBody | NoBody,
      GithubLinkResponse
    >()({
      method: HttpMethod.Post,
      path: "/auth/github/link",
      credentials: true
    });
    /** Unlinks GitHub (vb2007/vb2007.hu-api#134), confirmed with the password (#243). */
    static readonly githubUnlink = defineEndpoint<GithubPasswordBody, MessageResponse>()({
      method: HttpMethod.Delete,
      path: "/auth/github/link",
      credentials: true
    });
  };

  static readonly User = class {
    static readonly get = defineEndpoint<undefined, UserDetails>()({
      method: HttpMethod.Get,
      path: "/user",
      credentials: true
    });
    /** Deletes the account (vb2007/vb2007.hu-api#164). */
    static readonly remove = defineEndpoint<DeleteUserBody, MessageResponse>()({
      method: HttpMethod.Delete,
      path: "/user",
      credentials: true
    });
    /** Sets a password on an account that has none. */
    static readonly setPassword = defineEndpoint<SetPasswordBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/user/password",
      credentials: true
    });
    /** Changes the password (vb2007/vb2007.hu-api#161). */
    static readonly changePassword = defineEndpoint<ChangePasswordBody, MessageResponse>()({
      method: HttpMethod.Patch,
      path: "/user/password",
      credentials: true
    });
    /** The new address with the current password (vb2007/vb2007.hu-api#162). */
    static readonly changeEmail = defineEndpoint<ChangeEmailBody, MessageResponse>()({
      method: HttpMethod.Patch,
      path: "/user/email",
      credentials: true
    });
    /** The code sent to the new address switches to it (vb2007/vb2007.hu-api#215). */
    static readonly confirmEmail = defineEndpoint<ConfirmEmailBody, MessageResponse>()({
      method: HttpMethod.Post,
      path: "/user/email/confirm",
      credentials: true
    });
  };

  static readonly ShortUrl = class {
    /**
     * The API's own redirect, still the fallback of the site's /r/:code page: a browser
     * navigation (`apiUrl`), not a fetch call.
     */
    static readonly redirect = defineEndpoint()({
      method: HttpMethod.Get,
      path: "/r/:shortenedUrl",
      credentials: false
    });
    /** Resolves a short code to its target as JSON (vb2007/vb2007.hu-api#75). */
    static readonly lookup = defineEndpoint<undefined, ShortUrlLookupResponse>()({
      method: HttpMethod.Get,
      path: "/shortenUrl/:shortenedUrl",
      credentials: false
    });
    // Temporary: the API currently serves this at /shortenUrl/create; revert to /shortenUrl once it is fixed.
    static readonly create = defineEndpoint<ShortenUrlBody, ShortenUrlResponse>()({
      method: HttpMethod.Post,
      path: "/shortenUrl/create",
      credentials: true
    });
  };

  static readonly Pastebin = class {
    static readonly list = defineEndpoint<undefined, PastesResponse, PasteListQuery>()({
      method: HttpMethod.Get,
      path: "/pastes/:username",
      credentials: true
    });
    static readonly get = defineEndpoint<undefined, PasteResponse>()({
      method: HttpMethod.Get,
      path: "/paste/:id",
      credentials: true
    });
    static readonly create = defineEndpoint<CreatePasteBody, PasteSavedResponse>()({
      method: HttpMethod.Post,
      path: "/paste",
      credentials: true
    });
    /** Changes the language (vb2007/vb2007.hu-api#124). */
    static readonly update = defineEndpoint<UpdatePasteBody, PasteSavedResponse>()({
      method: HttpMethod.Patch,
      path: "/paste/:id",
      credentials: true
    });
    static readonly remove = defineEndpoint<undefined, PasteDeletedResponse>()({
      method: HttpMethod.Delete,
      path: "/paste/:id",
      credentials: true
    });
  };

  /** The logged-in user's file uploads (vb2007/vb2007.hu-api#81 to #87). */
  static readonly Uploads = class {
    static readonly list = defineEndpoint<undefined, UploadsResponse, UploadListQuery>()({
      method: HttpMethod.Get,
      path: "/uploads",
      credentials: true
    });
    static readonly usage = defineEndpoint<undefined, UploadUsage>()({
      method: HttpMethod.Get,
      path: "/uploads/usage",
      credentials: true
    });
    /** The owner's or the superuser's: a private one comes with a newly signed link. */
    static readonly get = defineEndpoint<undefined, UploadResponse>()({
      method: HttpMethod.Get,
      path: "/upload/:id",
      credentials: true
    });
    /** Multipart form fields; sent with XMLHttpRequest for its progress events, not `apiRequest`. */
    static readonly upload = defineEndpoint<UploadFileFields, UploadSavedResponse>()({
      method: HttpMethod.Post,
      path: "/upload",
      credentials: true
    });
    static readonly update = defineEndpoint<UpdateUploadBody, UploadSavedResponse>()({
      method: HttpMethod.Patch,
      path: "/upload/:id",
      credentials: true
    });
    static readonly remove = defineEndpoint<undefined, UploadDeletedResponse>()({
      method: HttpMethod.Delete,
      path: "/upload/:id",
      credentials: true
    });
  };

  /** The superuser's admin routes (vb2007/vb2007.hu-api#120 to #122). */
  static readonly Admin = class {
    static readonly users = defineEndpoint<undefined, AdminUsersResponse, AdminUserListQuery>()({
      method: HttpMethod.Get,
      path: "/admin/users",
      credentials: true
    });
    static readonly setUploadQuota = defineEndpoint<SetUploadQuotaBody, UploadQuotaResponse>()({
      method: HttpMethod.Patch,
      path: "/admin/users/:id/upload-quota",
      credentials: true
    });
    /** Answers like `Uploads.list`, plus whose uploads they are. */
    static readonly userUploads = defineEndpoint<undefined, UploadsResponse, UploadListQuery>()({
      method: HttpMethod.Get,
      path: "/admin/users/:id/uploads",
      credentials: true
    });
    static readonly pendingRegistrations = defineEndpoint<
      undefined,
      PendingRegistrationsResponse,
      PendingRegistrationListQuery
    >()({
      method: HttpMethod.Get,
      path: "/admin/pending-registrations",
      credentials: true
    });
    static readonly removePendingRegistration = defineEndpoint<undefined, MessageResponse>()({
      method: HttpMethod.Delete,
      path: "/admin/pending-registrations/:id",
      credentials: true
    });
    static readonly clearRateLimits = defineEndpoint<
      ClearRateLimitsBody,
      ClearRateLimitsResponse
    >()({
      method: HttpMethod.Delete,
      path: "/admin/rate-limits",
      credentials: true
    });
  };
}
