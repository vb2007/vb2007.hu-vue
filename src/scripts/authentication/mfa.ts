import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { ErrorReason, HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiErrorOf, apiRequest, type ApiFailure, type ApiResult } from "@/scripts/api/client";
import {
  currentLogin,
  endMfa,
  finishedElsewhere,
  finishLogin,
  isCurrentLogin,
  loginStatus,
  startMfa
} from "@/scripts/authentication/user";
import type { MessageResponse } from "@/types/api/common";
import type { MfaVerifyBody } from "@/types/api/mfa";

/**
 * Why the failure ended the second step, in the site's words, or `undefined` when it didn't: the
 * API's 403 by its `reason` (vb2007/vb2007.hu-api#494, its own message for one the site doesn't
 * know), or a wrong answer that used the last try (`attemptsLeft: 0`), which the next one would get.
 */
export const mfaEndOf = (failure: ApiFailure): string | undefined => {
  if (failure.kind !== "http") return;
  if (failure.body?.attemptsLeft === 0)
    return Messages.Mfa.triesUsedUp(Limits.Mfa.challengeAttempts);
  if (failure.status !== HttpStatus.Forbidden) return;
  switch (failure.body?.reason) {
    case ErrorReason.NoChallenge:
      return Messages.Mfa.noChallenge;
    case ErrorReason.Expired:
      return Messages.Mfa.stepExpired(Limits.Mfa.challengeMinutes);
    case ErrorReason.TriesUsedUp:
      return Messages.Mfa.triesUsedUp(Limits.Mfa.challengeAttempts);
    case ErrorReason.Ended:
      return Messages.Mfa.stepEnded;
    default:
      return failure.error;
  }
};

/**
 * Back from a GitHub login with `?mfa=required`: asks which methods the waiting second step takes
 * (vb2007/vb2007.hu-api#448). An expired step's 403 shows on the login form.
 */
export const loadMfaMethods = async () => {
  const attempt = currentLogin();
  const result = await apiRequest(Endpoints.Auth.mfaMethods, {
    failure: Messages.Mfa.methodsFailed,
    quietStatuses: [HttpStatus.Forbidden]
  });
  if (!isCurrentLogin(attempt)) return;
  if (result.ok) {
    startMfa(result.data.methods);
  } else {
    loginStatus.value = mfaEndOf(result) ?? apiErrorOf(result) ?? LoginStatus.UnknownError;
  }
};

/**
 * Sends the second step's answer. A pass finishes the login; an end (the API's 403: the step
 * expired, used up its tries or was replaced by a newer login; or a wrong last try) goes back to
 * the password with its reason. Returns the failure, for the step to show, or nothing once it passed.
 */
const passMfa = async (
  request: Promise<ApiResult<MessageResponse>>
): Promise<ApiFailure | undefined> => {
  const attempt = currentLogin();
  const result = await request;
  if (result.ok) {
    await finishLogin(attempt);
    return;
  }
  const ended = mfaEndOf(result);
  if (ended !== undefined) {
    // The step is gone once another tab passed it (its mailed link, say): then this one's logged in.
    if (await finishedElsewhere(attempt)) return;
    if (isCurrentLogin(attempt)) endMfa(ended);
  }
  return result;
};

/** A method's answer, e.g. the mailed code. */
export const verifyMfa = (body: MfaVerifyBody) =>
  passMfa(
    apiRequest(Endpoints.Auth.mfaVerify, {
      body,
      failure: Messages.Mfa.verifyFailed,
      // A wrong code, an expired step and the daily limit are answers, not faults.
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.Forbidden, HttpStatus.TooManyRequests]
    })
  );

/**
 * The passkey's request options for the waiting step (vb2007/vb2007.hu-api#484). Its 403 (the step
 * expired) goes back to the password, like an answer's.
 */
export const loadMfaPasskeyOptions = async () => {
  const attempt = currentLogin();
  const result = await apiRequest(Endpoints.Auth.mfaPasskeyOptions, {
    failure: Messages.Passkeys.optionsFailed,
    quietStatuses: [HttpStatus.Forbidden]
  });
  const ended = result.ok ? undefined : mfaEndOf(result);
  if (ended !== undefined && isCurrentLogin(attempt)) endMfa(ended);
  return result;
};

/** The token of the mailed link, which only works in the browser that logged in. */
export const verifyMfaLink = (token: string) =>
  passMfa(
    apiRequest(Endpoints.Auth.mfaVerifyLink, {
      body: { token },
      failure: Messages.Mfa.linkFailed,
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.Forbidden, HttpStatus.TooManyRequests]
    })
  );
