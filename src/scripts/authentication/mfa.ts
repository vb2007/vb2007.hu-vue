import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
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
    loginStatus.value = apiErrorOf(result) ?? LoginStatus.UnknownError;
  }
};

/**
 * Sends the second step's answer. A pass finishes the login; the API's 403 (the step expired, used
 * up its tries or was replaced by a newer login) goes back to the password with its message.
 * Returns the failure, for the step to show, or nothing once it passed.
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
  if (result.status === HttpStatus.Forbidden) {
    // The step is gone once another tab passed it (its mailed link, say): then this one's logged in.
    if (await finishedElsewhere(attempt)) return;
    if (isCurrentLogin(attempt)) endMfa(result.error);
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
  if (!result.ok && result.status === HttpStatus.Forbidden && isCurrentLogin(attempt)) {
    endMfa(result.error);
  }
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
