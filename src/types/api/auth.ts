/** `POST /auth/login` */
export interface LoginBody {
  email: string;
  password: string;
}

/** `POST /auth/register`, answered with a 202 once the code is mailed (vb2007/vb2007.hu-api#28). */
export interface RegisterBody {
  username: string;
  email: string;
  password: string;
}

/**
 * `POST /auth/register/verify`, answered with a 201 and a session. The waiting registration only
 * holds the address and code: the account gets the username and password sent here
 * (vb2007/vb2007.hu-api#295).
 */
export interface RegisterVerifyBody {
  email: string;
  code: string;
  username: string;
  password: string;
}

/** `POST /auth/register/resend` (vb2007/vb2007.hu-api#30) and `POST /auth/password-reset` */
export interface EmailBody {
  email: string;
}

/** `GET /auth/username-available` (vb2007/vb2007.hu-api#233) */
export type UsernameAvailableQuery = {
  username: string;
};

/** `GET /auth/username-available` */
export interface UsernameAvailableResponse {
  available: boolean;
}

/** `POST /auth/password-reset/confirm` (vb2007/vb2007.hu-api#163) */
export interface PasswordResetConfirmBody {
  email: string;
  code: string;
  newPassword: string;
}

/**
 * `POST` and `DELETE /auth/github/link` (vb2007/vb2007.hu-api#243): an account with a password
 * confirms linking and unlinking with it. A GitHub-only account links without a body.
 */
export interface GithubPasswordBody {
  password: string;
}

/** `POST /auth/github/link`: where to send the browser to authorise the link on GitHub. */
export interface GithubLinkResponse {
  url: string;
}
