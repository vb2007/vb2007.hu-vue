import { ref } from "vue";

export const isLoggedIn = ref(false);
export const userEmail = ref("");
/** The account's id, which a mailed password reset link starts with. */
export const userId = ref("");
/** Needed for the per-user API routes, e.g. listing a user's pastes. */
export const username = ref("");
/** The site's superuser (vb2007/vb2007.hu-api#117); opens the admin page. */
export const isSuperuser = ref(false);
/** Whether GitHub is linked, so the user can also log in with it (vb2007/vb2007.hu-api#128). */
export const githubLinked = ref(false);
/** The linked GitHub account's login, shown as `@login` (vb2007/vb2007.hu-api#133). */
export const githubLogin = ref("");
/** False for an account made with GitHub, which can't unlink it (vb2007/vb2007.hu-api#133). */
export const hasPassword = ref(false);
/** The new address while a change waits for its mailed code, or "" (vb2007/vb2007.hu-api#215). */
export const pendingEmail = ref("");
/**
 * Counts the password changes made on this page, so the e-mail form can drop outcomes a new
 * password made obsolete (vb2007/vb2007.hu-api#474).
 */
export const passwordChanges = ref(0);
/** Whether the address was confirmed with a code or by GitHub; false for older accounts. */
export const emailVerified = ref(false);
/** True once the initial session lookup has finished, so the UI doesn't flash a logged-out state. */
export const isSessionChecked = ref(false);
/**
 * True once the API turned away a session this page had, until the next login: it expired, the
 * password was reset (vb2007/vb2007.hu-api#218), or the account was logged in or out elsewhere (the
 * API keeps one session per account). Logging out here leaves it false.
 */
export const sessionEnded = ref(false);
