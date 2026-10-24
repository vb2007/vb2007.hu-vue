import { ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { oauthErrorMessage } from "@/scripts/authentication/github";

/**
 * Reads how a GitHub login or link ended from the URL: `?oauthError=<code>` when it failed,
 * `?github=linked` after linking (vb2007/vb2007.hu-api#132). Then drops both from the address bar
 * so a refresh doesn't show the message again.
 */
export const useOauthResult = () => {
  const route = useRoute();
  const router = useRouter();
  const error = ref("");
  const { oauthError, github, ...query } = route.query;
  const linked = ref(github === "linked");

  if (typeof oauthError === "string" && oauthError) {
    error.value = oauthErrorMessage(oauthError);
  }
  if (error.value || linked.value) {
    router.replace({ query, hash: route.hash });
  }

  return { error, linked };
};
