import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { oauthErrorMessage } from "@/scripts/authentication/github";

/**
 * Reads a failed GitHub login's `?oauthError=` from the URL, then drops it from the address bar
 * so a refresh doesn't show the message again.
 */
export const useOauthError = () => {
  const route = useRoute();
  const router = useRouter();
  const message = ref("");
  const code = route.query.oauthError;

  if (typeof code === "string" && code) {
    message.value = oauthErrorMessage(code);
    const query = { ...route.query };
    delete query.oauthError;
    router.replace({ query, hash: route.hash });
  }

  return message;
};
