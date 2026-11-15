import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { apiRequest, type ApiFailure, type ApiResult } from "@/scripts/api/client";
import { EMOJI_JOINERS, EMOJI_TAG_SEQUENCES } from "@/scripts/authentication/register";
import {
  currentLogin,
  finishLogin,
  forgetLogin,
  isCurrentLogin,
  loginStatus
} from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";

/** Control, format, line and paragraph separator characters, which the API's `passkeyNameError` refuses. */
const INVALID_PASSKEY_NAME_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * A passkey name's problem, "" when it has none, checked like the API's `passkeyNameError` on the
 * trimmed name the site sends: the character rule allows the joiners and tags inside emoji, as
 * usernames do. It must match the API's, since its 400 only comes after the browser made the
 * passkey, which would then be left on the device.
 */
export const passkeyNameError = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return Messages.Passkeys.nameMissing;
  if (
    INVALID_PASSKEY_NAME_CHARACTER.test(
      trimmed.replace(EMOJI_JOINERS, "").replace(EMOJI_TAG_SEQUENCES, "")
    )
  ) {
    return Messages.Passkeys.nameInvalidCharacters;
  }
  return [...trimmed].length > Limits.Passkey.nameMaxLength
    ? Messages.Passkeys.nameTooLong(Limits.Passkey.nameMaxLength)
    : "";
};

/**
 * Options fetched ahead of the click that uses them (vb2007/vb2007.hu-api#446): Safari may refuse
 * a prompt that waits for a request after the click. `take` hands on the options fetched ahead, or
 * their failure, while they're live (their `timeout` from when they were asked for), else asks now,
 * and says whether this click had to wait for them. Each set is taken once: the API's next options
 * replace its challenge.
 */
export const optionsAhead = <T extends { timeout?: number }>(
  fetch: () => Promise<ApiResult<T>>
) => {
  let ahead: { pending: Promise<ApiResult<T>>; settled: boolean; sentAt: number } | undefined;

  /** Asks for the next click's options, unless some are on their way or waiting. */
  const prefetch = () => {
    if (ahead) return;
    const entry = { pending: fetch(), settled: false, sentAt: Date.now() };
    void entry.pending.then(() => (entry.settled = true));
    ahead = entry;
  };

  const take = async (): Promise<{ result: ApiResult<T>; fetched: boolean }> => {
    const entry = ahead;
    ahead = undefined;
    if (entry) {
      const settled = entry.settled;
      const result = await entry.pending;
      const live = !result.ok || entry.sentAt + (result.data.timeout ?? 0) > Date.now();
      if (live) return { result, fetched: !settled };
    }
    return { result: await fetch(), fetched: true };
  };

  return { prefetch, take };
};

const loginOptions = optionsAhead(() =>
  apiRequest(Endpoints.Auth.passkeyOptions, { failure: Messages.Passkeys.optionsFailed })
);

/** Gets the login's options ready, e.g. once the pointer or the focus reaches its key. */
export const prefetchPasskeyLogin = loginOptions.prefetch;

/** A name only gets too long by typing more: shown while typing. */
export const passkeyNameEarlyError = (name: string) => (name.trim() ? passkeyNameError(name) : "");

/**
 * Why a passkey login didn't log in: "" for a cancelled prompt (or `noPrompt` when it followed
 * a wait for the options); `wait` after the API's 429.
 */
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
  const { result: options, fetched } = await loginOptions.take();
  if (!isCurrentLogin(attempt)) return;
  if (!options.ok) return failureOf(options);

  // The prompt can stay open for minutes.
  const passkey = await getPasskey(options.data);
  if (!isCurrentLogin(attempt)) return;
  if (!passkey.ok) return { error: passkey.error || (fetched ? Messages.Passkeys.noPrompt : "") };

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
