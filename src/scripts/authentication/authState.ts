import { ref } from "vue";

export const isLoggedIn = ref(false);
export const userEmail = ref("");
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
/** True once the initial session lookup has finished, so the UI doesn't flash a logged-out state. */
export const isSessionChecked = ref(false);
