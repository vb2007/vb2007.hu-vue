import { onScopeDispose, ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { OauthError } from "@/constants/oauth";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import { oauthErrorMessage } from "@/scripts/authentication/github";
import { fetchUserDetails } from "@/scripts/authentication/user";

/**
 * How long the browser may take to leave for GitHub before the user may give up on it: a stopped
 * navigation, or a GitHub URL an extension blocks, would otherwise leave the page waiting for good.
 */
export const LEAVING_GRACE_MS = 5000;

/**
 * Starts linking GitHub to the logged-in account (vb2007/vb2007.hu-api#243): an account with a
 * password confirms with it, then the browser goes on to GitHub. A second start would replace the
 * first one's proof, so `isLinking` stays on from the request until the page is gone, or `stop()`
 * gives up on it; `isStalled` says the browser should have left by now, so it may be given up on.
 * `navigate` is only swapped out by tests; jsdom can't follow a real navigation.
 */
export const useGithubLink = (navigate = (url: string) => window.location.assign(url)) => {
  const isLinking = ref(false);
  const isStalled = ref(false);
  const linkError = ref("");
  /** After the password checks' 429 (too many wrong passwords), linking waits its `retryAfter`. */
  const hold = useRetryHold(linkError);
  let stallTimer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;

  /** Gives up on a start: the next one may begin. */
  const stop = () => {
    clearTimeout(stallTimer);
    isLinking.value = false;
    isStalled.value = false;
  };

  // Back from GitHub through the back/forward cache: the page is as it was left, and the link may
  // have been made meanwhile.
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    stop();
    void fetchUserDetails();
  };
  window.addEventListener("pageshow", onPageShow);
  onScopeDispose(() => {
    window.removeEventListener("pageshow", onPageShow);
    clearTimeout(stallTimer);
    // Leaving the page before the API answers must not send the browser to GitHub from elsewhere.
    request?.abort();
  }, true);

  /** Returns whether the browser is on its way to GitHub. */
  const link = async (password?: string) => {
    if (isLinking.value) return false;
    isLinking.value = true;
    linkError.value = "";
    const controller = (request = new AbortController());

    const result = await apiRequest(Endpoints.Auth.githubStartLink, {
      body: password === undefined ? undefined : { password },
      failure: Messages.Account.githubLinkFailed,
      signal: controller.signal
    });
    request = undefined;

    // The page that asked is gone, even if the answer came in just before.
    if (controller.signal.aborted) return false;
    if (result.ok) {
      navigate(result.data.url);
      stallTimer = setTimeout(() => (isStalled.value = true), LEAVING_GRACE_MS);
      return true;
    }

    if (result.status === HttpStatus.ServiceUnavailable) {
      // The API answers its `notConfigured` code, not a sentence.
      linkError.value = oauthErrorMessage(OauthError.notConfigured);
    } else if (result.status === HttpStatus.TooManyRequests) {
      linkError.value = apiErrorOf(result) ?? Messages.Account.tooManyRequests;
      hold.start(retryAfterFrom(result.body));
    } else {
      linkError.value = result.error;
    }
    isLinking.value = false;

    return false;
  };

  return { isLinking, isStalled, linkError, link, stop, hold };
};
