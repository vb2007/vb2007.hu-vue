/** `GET /user`: the logged-in user, without its secrets. */
export interface UserDetails {
  _id: string;
  username: string;
  email: string;
  /** Set while GitHub is linked (vb2007/vb2007.hu-api#128). */
  githubId?: string;
  /** The linked GitHub account's login (vb2007/vb2007.hu-api#133). */
  githubLogin?: string;
  createdAt: string;
  /** False for an account made with GitHub that never set one. */
  hasPassword: boolean;
  /** Confirmed with a code or by GitHub; false for older accounts. */
  emailVerified: boolean;
  /**
   * The new address while a change waits for its code (vb2007/vb2007.hu-api#215): null once it
   * expired or its tries are used up (vb2007/vb2007.hu-api#463).
   */
  pendingEmail: string | null;
  isSuperuser: boolean;
}

/**
 * `DELETE /user` (vb2007/vb2007.hu-api#164): an account with a password confirms with it, one made
 * with GitHub with its username.
 */
export type DeleteUserBody = { password: string } | { username: string };

/** `POST /user/password`, on an account without one (vb2007/vb2007.hu-api#155). */
export interface SetPasswordBody {
  password: string;
}

/** `PATCH /user/password` (vb2007/vb2007.hu-api#161) */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

/**
 * `PATCH /user/email` (vb2007/vb2007.hu-api#162): a 202 once a code went to the new address, a 200
 * when it already was the current one.
 */
export interface ChangeEmailBody {
  email: string;
  password: string;
}

/** `POST /user/email/confirm` (vb2007/vb2007.hu-api#215) */
export interface ConfirmEmailBody {
  code: string;
}
