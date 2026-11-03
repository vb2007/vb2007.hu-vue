import { onScopeDispose, ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { OauthError } from "@/constants/oauth";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import { oauthErrorMessage } from "@/scripts/authentication/github";

/**
 * Starts linking GitHub to the logged-in account (vb2007/vb2007.hu-api#243): an account with a
 * password confirms with it, then the browser goes on to GitHub. A second start would replace the
 * first one's proof, so `isLinking` stays on from the request until the page is gone.
 * `navigate` is only swapped out by tests; jsdom can't follow a real navigation.
 */
export const useGithubLink = (navigate = (url: string) => window.location.assign(url)) => {
  const isLinking = ref(false);
  const linkError = ref("");

  // Back from GitHub through the back/forward cache, the page would still say it's on its way.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) isLinking.value = false;
  };
  window.addEventListener("pageshow", onPageShow);
  onScopeDispose(() => window.removeEventListener("pageshow", onPageShow), true);

  /** Returns whether the browser is on its way to GitHub. */
  const link = async (password?: string) => {
    if (isLinking.value) return false;
    isLinking.value = true;
    linkError.value = "";

    const result = await apiRequest(Endpoints.Auth.githubStartLink, {
      body: password === undefined ? undefined : { password },
      failure: Messages.Account.githubLinkFailed
    });

    if (result.ok) {
      navigate(result.data.url);
      return true;
    }

    if (result.status === HttpStatus.ServiceUnavailable) {
      // The API answers its `notConfigured` code, not a sentence.
      linkError.value = oauthErrorMessage(OauthError.notConfigured);
    } else if (result.status === HttpStatus.TooManyRequests) {
      linkError.value = apiErrorOf(result) ?? Messages.Account.tooManyRequests;
    } else {
      linkError.value = result.error;
    }
    isLinking.value = false;

    return false;
  };

  return { isLinking, linkError, link };
};
