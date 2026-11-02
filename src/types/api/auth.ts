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

/** `POST /auth/register/verify`, answered with a 201 and a session. */
export interface RegisterVerifyBody {
  email: string;
  code: string;
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
