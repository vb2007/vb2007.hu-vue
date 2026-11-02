import { ref } from "vue";
import { OauthQuery } from "@/constants/oauth";
import { useQueryNotice } from "@/composables/useQueryNotice";
import { oauthErrorMessage } from "@/scripts/authentication/github";

/** Explains a failed GitHub login's `?oauthError=` once (see useQueryNotice). */
export const useOauthError = () => {
  const code = useQueryNotice(OauthQuery.error);
  return ref(code ? oauthErrorMessage(code) : "");
};
