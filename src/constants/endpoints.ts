import { HttpMethod } from "@/constants/http";
import { defineEndpoint, type QueryValues } from "@/scripts/api/endpoint";
import type {
  CreatePasteBody,
  PasteDeletedResponse,
  PasteListQuery,
  PasteResponse,
  PasteSavedResponse,
  PastesResponse,
  UpdatePasteBody
} from "@/types/api/pastebin";

/** Baked in at build time; tests pin it to `https://api.test`. */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

/**
 * Not typed yet: the groups whose calls still use `fetch` directly get their body and response
 * types when they move to `apiRequest` (#101 to #104).
 */
const untyped = defineEndpoint<unknown, unknown, QueryValues>;

/**
 * Every API route the site calls, grouped like the API's routers, one entry per method and path.
 * Paths are written like the API's Express routes, so they can be checked against them as is.
 */
export class Endpoints {
  static readonly Auth = class {
    static readonly register = untyped()({
      method: HttpMethod.Post,
      path: "/auth/register",
      credentials: false
    });
    /** Sends the registration code again (vb2007/vb2007.hu-api#30). */
    static readonly registerResend = untyped()({
      method: HttpMethod.Post,
      path: "/auth/register/resend",
      credentials: false
    });
    /** The e-mailed code finishes registering and starts a session (vb2007/vb2007.hu-api#28). */
    static readonly registerVerify = untyped()({
      method: HttpMethod.Post,
      path: "/auth/register/verify",
      credentials: true
    });
    /** `?username=` says whether a username is free (vb2007/vb2007.hu-api#233). */
    static readonly usernameAvailable = untyped()({
      method: HttpMethod.Get,
      path: "/auth/username-available",
      credentials: false
    });
    static readonly login = untyped()({
      method: HttpMethod.Post,
      path: "/auth/login",
      credentials: true
    });
    static readonly logout = untyped()({
      method: HttpMethod.Post,
      path: "/auth/logout",
      credentials: true,
      redirect: "manual"
    });
    /** E-mails a password reset code (vb2007/vb2007.hu-api#163). */
    static readonly passwordReset = untyped()({
      method: HttpMethod.Post,
      path: "/auth/password-reset",
      credentials: false
    });
    /** The code with the new password (vb2007/vb2007.hu-api#163). */
    static readonly passwordResetConfirm = untyped()({
      method: HttpMethod.Post,
      path: "/auth/password-reset/confirm",
      credentials: false
    });
    /** GitHub login (vb2007/vb2007.hu-api#128): a browser navigation, not a fetch call. */
    static readonly github = untyped()({
      method: HttpMethod.Get,
      path: "/auth/github",
      credentials: false
    });
    /** Links GitHub to the logged-in account: a browser navigation, not a fetch call. */
    static readonly githubLink = untyped()({
      method: HttpMethod.Get,
      path: "/auth/github/link",
      credentials: true
    });
    /** Unlinks GitHub (vb2007/vb2007.hu-api#134). */
    static readonly githubUnlink = untyped()({
      method: HttpMethod.Delete,
      path: "/auth/github/link",
      credentials: true
    });
  };

  static readonly User = class {
    static readonly get = untyped()({ method: HttpMethod.Get, path: "/user", credentials: true });
    /** Deletes the account (vb2007/vb2007.hu-api#164). */
    static readonly remove = untyped()({
      method: HttpMethod.Delete,
      path: "/user",
      credentials: true
    });
    /** Sets a password on an account that has none. */
    static readonly setPassword = untyped()({
      method: HttpMethod.Post,
      path: "/user/password",
      credentials: true
    });
    /** Changes the password (vb2007/vb2007.hu-api#161). */
    static readonly changePassword = untyped()({
      method: HttpMethod.Patch,
      path: "/user/password",
      credentials: true
    });
    /** The new address with the current password (vb2007/vb2007.hu-api#162). */
    static readonly changeEmail = untyped()({
      method: HttpMethod.Patch,
      path: "/user/email",
      credentials: true
    });
    /** The code sent to the new address switches to it (vb2007/vb2007.hu-api#215). */
    static readonly confirmEmail = untyped()({
      method: HttpMethod.Post,
      path: "/user/email/confirm",
      credentials: true
    });
  };

  static readonly ShortUrl = class {
    /** The API's own redirect, still the fallback of the site's /r/:code page. */
    static readonly redirect = untyped()({
      method: HttpMethod.Get,
      path: "/r/:shortenedUrl",
      credentials: false
    });
    /** Resolves a short code to its target as JSON (vb2007/vb2007.hu-api#75). */
    static readonly lookup = untyped()({
      method: HttpMethod.Get,
      path: "/shortenUrl/:shortenedUrl",
      credentials: false
    });
    // Temporary: the API currently serves this at /shortenUrl/create; revert to /shortenUrl once it is fixed.
    static readonly create = untyped()({
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
    static readonly list = untyped()({
      method: HttpMethod.Get,
      path: "/uploads",
      credentials: true
    });
    static readonly usage = untyped()({
      method: HttpMethod.Get,
      path: "/uploads/usage",
      credentials: true
    });
    /** Multipart; sent with XMLHttpRequest for its progress events. */
    static readonly upload = untyped()({
      method: HttpMethod.Post,
      path: "/upload",
      credentials: true
    });
    static readonly update = untyped()({
      method: HttpMethod.Patch,
      path: "/upload/:id",
      credentials: true
    });
    static readonly remove = untyped()({
      method: HttpMethod.Delete,
      path: "/upload/:id",
      credentials: true
    });
  };

  /** The superuser's admin routes (vb2007/vb2007.hu-api#120 to #122). */
  static readonly Admin = class {
    static readonly users = untyped()({
      method: HttpMethod.Get,
      path: "/admin/users",
      credentials: true
    });
    static readonly setUploadQuota = untyped()({
      method: HttpMethod.Patch,
      path: "/admin/users/:id/upload-quota",
      credentials: true
    });
    static readonly userUploads = untyped()({
      method: HttpMethod.Get,
      path: "/admin/users/:id/uploads",
      credentials: true
    });
  };
}
