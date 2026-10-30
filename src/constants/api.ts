const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL;

export class UserManagement {
  static Authentication = class {
    static register: string = `${API_BASE_URL}/auth/register`;
    static login: string = `${API_BASE_URL}/auth/login`;
    static logout: string = `${API_BASE_URL}/auth/logout`;
    /** GitHub login (vb2007/vb2007.hu-api#128): browser navigations, not fetch calls. */
    static github: string = `${API_BASE_URL}/auth/github`;
    /** Also `DELETE` (a fetch call) to unlink GitHub (vb2007/vb2007.hu-api#134). */
    static githubLink: string = `${API_BASE_URL}/auth/github/link`;
    /** `POST` the e-mailed code to finish registering (vb2007/vb2007.hu-api#28). */
    static registerVerify: string = `${API_BASE_URL}/auth/register/verify`;
    /** `POST` to send the registration code again (vb2007/vb2007.hu-api#30). */
    static registerResend: string = `${API_BASE_URL}/auth/register/resend`;
    /** `POST` to e-mail a password reset code (vb2007/vb2007.hu-api#163). */
    static passwordReset: string = `${API_BASE_URL}/auth/password-reset`;
    /** `POST` the code with the new password (vb2007/vb2007.hu-api#163). */
    static passwordResetConfirm: string = `${API_BASE_URL}/auth/password-reset/confirm`;
  };

  static Actions = class {
    /** Also `DELETE` to delete the account (vb2007/vb2007.hu-api#164). */
    static user: string = `${API_BASE_URL}/user`;
    /** `PATCH` with the new address and the current password (vb2007/vb2007.hu-api#162). */
    static userEmail: string = `${API_BASE_URL}/user/email`;
    /** `PATCH` changes the password (vb2007/vb2007.hu-api#161). */
    static userPassword: string = `${API_BASE_URL}/user/password`;
    /** `POST` the code sent to the new address to switch to it (vb2007/vb2007.hu-api#215). */
    static userEmailConfirm: string = `${API_BASE_URL}/user/email/confirm`;
  };
}

export class UrlShortening {
  /** The API's own redirect, still used as a fallback by the site's /r/:code page. */
  static redirect: string = `${API_BASE_URL}/r/`;
  /** Resolves a short code to its target as JSON (vb2007/vb2007.hu-api#75). */
  static lookup: string = `${API_BASE_URL}/shortenUrl/:shortenedUrl`;
  // Temporary: the API currently serves this at /shortenUrl/create; revert to /shortenUrl once it is fixed.
  static shortenUrl: string = `${API_BASE_URL}/shortenUrl/create`;
}

export class Pastebin {
  static paste: string = `${API_BASE_URL}/paste`;
  static pasteWithId: string = `${API_BASE_URL}/paste/:id`;
  static pastesByUsername: string = `${API_BASE_URL}/pastes/:username`;
}

/** The logged-in user's file uploads (vb2007/vb2007.hu-api#81 to #87). */
export class UserUploads {
  static uploads: string = `${API_BASE_URL}/uploads`;
  static usage: string = `${API_BASE_URL}/uploads/usage`;
  static upload: string = `${API_BASE_URL}/upload`;
  static uploadWithId: string = `${API_BASE_URL}/upload/:id`;
}

/** The superuser's admin endpoints (vb2007/vb2007.hu-api#120 to #122). */
export class Admin {
  static users: string = `${API_BASE_URL}/admin/users`;
  static uploadQuota: string = `${API_BASE_URL}/admin/users/:id/upload-quota`;
  static userUploads: string = `${API_BASE_URL}/admin/users/:id/uploads`;
}
