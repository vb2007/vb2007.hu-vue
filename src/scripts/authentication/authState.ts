import { ref } from "vue";

export const isLoggedIn = ref(false);
export const userEmail = ref("");
/** Needed for the per-user API routes, e.g. listing a user's pastes. */
export const username = ref("");
/** The site's superuser (vb2007/vb2007.hu-api#117); opens the admin page. */
export const isSuperuser = ref(false);
/** True once the initial session lookup has finished, so the UI doesn't flash a logged-out state. */
export const isSessionChecked = ref(false);
