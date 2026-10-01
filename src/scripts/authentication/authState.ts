import { ref } from "vue";

export const isLoggedIn = ref(false);
export const userEmail = ref("");
/** True once the initial session lookup has finished, so the UI doesn't flash a logged-out state. */
export const isSessionChecked = ref(false);
