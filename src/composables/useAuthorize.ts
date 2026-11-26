import { onScopeDispose, ref } from "vue";
import type { LocationQuery } from "vue-router";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { AuthorizeQuery } from "@/constants/oauth";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { clearGithubReturn } from "@/scripts/authentication/githubReturn";
import type { AuthorizeParams, OauthClient } from "@/types/api/oauth";

const PROBLEMS: Record<string, string> = {
  [AuthorizeQuery.invalidClient]: Messages.OAuth.invalidClient,
  [AuthorizeQuery.invalidRedirectUri]: Messages.OAuth.invalidRedirectUri
};

/** The request's parameters, when each is there once; anything else in the query stays out. */
const paramsOf = (query: LocationQuery): AuthorizeParams | undefined => {
  const params: Partial<AuthorizeParams> = {};
  for (const name of AuthorizeQuery.params) {
    const value = query[name];
    if (typeof value !== "string") return undefined;
    params[name] = value;
  }
  return params as AuthorizeParams;
};

/**
 * The `/authorize` page's request (vb2007/vb2007.hu-api#575): the app it's for, and the user's
 * answer. `problem` is a request that can't go on (an unknown app or redirect URI, a missing
 * parameter, the API's `400`): it gets no answer and never sends the browser anywhere. `error`
 * is a failed answer that may work again; the `429` holds both keys for its `retryAfter`.
 *
 * The browser only ever goes to the `redirectTo` the API answers, never to the query's
 * `redirect_uri`, which nobody has vetted here. `navigate` is only swapped out by tests.
 */
export const useAuthorize = (
  query: LocationQuery,
  navigate = (url: string) => window.location.assign(url)
) => {
  const app = ref<OauthClient | null>(null);
  const problem = ref("");
  const error = ref("");
  /** The answer on its way, and still once the browser is leaving with it. */
  const sending = ref<"approve" | "deny" | "">("");
  const hold = useRetryHold(error);
  const params = paramsOf(query);
  const handedError = query[AuthorizeQuery.error];
  const clientId = query.client_id;

  if (handedError !== undefined) {
    problem.value =
      (typeof handedError === "string" && PROBLEMS[handedError]) || Messages.OAuth.invalidRequest;
  } else if (typeof clientId !== "string" || !clientId) {
    problem.value = Messages.OAuth.invalidClient;
  } else if (!params) {
    problem.value = Messages.OAuth.invalidRequest;
  } else {
    void apiRequest(Endpoints.OAuth.client, {
      params: { clientId },
      failure: Messages.OAuth.clientFailed,
      quietStatuses: [HttpStatus.NotFound]
    }).then((result) => {
      if (result.ok) app.value = result.data;
      else
        problem.value =
          result.status === HttpStatus.NotFound
            ? Messages.OAuth.invalidClient
            : Messages.OAuth.clientUnavailable;
    });
  }

  // On the page again, a GitHub login left for here is over: its return mustn't bounce a later
  // visit to home back here. Back from the app or GitHub through the back/forward cache, the page is
  // as it was left: answering again asks the API for a new code.
  clearGithubReturn();
  const onPageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    clearGithubReturn();
    sending.value = "";
  };
  window.addEventListener("pageshow", onPageShow);
  onScopeDispose(() => window.removeEventListener("pageshow", onPageShow));

  /** Approves or denies; returns whether the browser is on its way back to the app. */
  const answer = async (approve: boolean) => {
    if (!params || problem.value || sending.value || hold.isHeld()) return false;
    sending.value = approve ? "approve" : "deny";
    error.value = "";
    const result = await apiRequest(Endpoints.OAuth.authorize, {
      body: { ...params, approve },
      failure: Messages.OAuth.authorizeFailed,
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.TooManyRequests]
    });
    if (result.ok) {
      navigate(result.data.redirectTo);
      return true;
    }
    sending.value = "";
    // A logged-out 403 (the session ended, or the account was suspended) has logged the page out
    // already: the login takes over, and its own refusal says why.
    if (!isLoggedIn.value) return false;
    if (result.status === HttpStatus.BadRequest) {
      problem.value = Messages.OAuth.invalidRequest;
    } else if (result.status === HttpStatus.TooManyRequests) {
      error.value = apiErrorOf(result) ?? Messages.OAuth.tooManyRequests;
      hold.start(retryAfterFrom(result.body));
    } else {
      error.value = result.error;
    }
    return false;
  };

  return { app, problem, error, sending, hold, answer };
};
