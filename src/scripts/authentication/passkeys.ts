import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { apiRequest, type ApiFailure } from "@/scripts/api/client";
import {
  currentLogin,
  finishLogin,
  forgetLogin,
  isCurrentLogin,
  loginStatus
} from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";

/**
 * A passkey name's problem, "" when it has none. The API also refuses line breaks and invisible
 * formatting characters, which its 400 names.
 */
export const passkeyNameError = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return Messages.Passkeys.nameMissing;
  return [...trimmed].length > Limits.Passkey.nameMaxLength
    ? Messages.Passkeys.nameTooLong(Limits.Passkey.nameMaxLength)
    : "";
};

/** A name only gets too long by typing more: shown while typing. */
export const passkeyNameEarlyError = (name: string) => (name.trim() ? passkeyNameError(name) : "");

/** Why a passkey login didn't log in: "" for a cancelled prompt; `wait` after the API's 429. */
export interface PasskeyLoginFailure {
  error: string;
  wait?: number;
}

const failureOf = (result: ApiFailure): PasskeyLoginFailure => ({
  error: result.error,
  wait:
    result.kind === "http" && result.status === HttpStatus.TooManyRequests
      ? retryAfterFrom(result.body)
      : undefined
});

/**
 * Logs in with a passkey (vb2007/vb2007.hu-api#446): the API's options, the browser's prompt, then
 * its answer, whose session skips any second step. It's a login of its own, numbered like the
 * password's, so one sent meanwhile (or leaving the form) silences it. Returns the failure, or
 * nothing once logged in or silenced.
 */
export const passkeyLogin = async (): Promise<PasskeyLoginFailure | undefined> => {
  forgetLogin();
  const attempt = currentLogin();
  const options = await apiRequest(Endpoints.Auth.passkeyOptions, {
    failure: Messages.Passkeys.optionsFailed
  });
  if (!isCurrentLogin(attempt)) return;
  if (!options.ok) return failureOf(options);

  // The prompt can stay open for minutes.
  const passkey = await getPasskey(options.data);
  if (!isCurrentLogin(attempt)) return;
  if (!passkey.ok) return { error: passkey.error };

  const result = await apiRequest(Endpoints.Auth.passkeyLogin, {
    body: { response: passkey.response },
    failure: Messages.Passkeys.loginFailed,
    // A passkey this site doesn't know, or a suspended account: the user's answer, not a fault.
    quietStatuses: [HttpStatus.Forbidden]
  });
  if (!result.ok) return isCurrentLogin(attempt) ? failureOf(result) : undefined;

  await finishLogin(attempt);
  // The browser may not have kept the session cookie. It's said by the passkey's key alone, not
  // as the password form's outcome too.
  if (isCurrentLogin(attempt) && loginStatus.value !== LoginStatus.Success) {
    const error = loginStatus.value;
    loginStatus.value = "";
    return { error };
  }
};
