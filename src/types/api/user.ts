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
  /** The new address while a change waits for its code (vb2007/vb2007.hu-api#215). */
  pendingEmail: string | null;
  isSuperuser: boolean;
}
