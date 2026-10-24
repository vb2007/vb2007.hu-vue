import { ref } from "vue";
import { useQueryNotice } from "@/composables/useQueryNotice";
import { oauthErrorMessage } from "@/scripts/authentication/github";

/** Explains a failed GitHub login's `?oauthError=` once (see useQueryNotice). */
export const useOauthError = () => {
  const code = useQueryNotice("oauthError");
  return ref(code ? oauthErrorMessage(code) : "");
};
