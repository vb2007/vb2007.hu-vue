import { LoginStatus } from "@/constants/auth";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { apiRequest, type ApiFailure, type ApiResult } from "@/scripts/api/client";
import { displayNameEarlyError, displayNameError } from "@/scripts/authentication/displayName";
import {
  currentLogin,
  finishLogin,
  forgetLogin,
  isCurrentLogin,
  loginStatus
} from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";

/**
 * A passkey name's problem, "" when it has none, like the API's `passkeyNameError`. It must match
 * the API's, since its 400 only comes after the browser made the passkey, which would then be left
 * on the device.
 */
export const passkeyNameError = (name: string) =>
  displayNameError(name, Limits.Passkey.nameMaxLength, Messages.Passkeys);

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
  let ahead: { pending: Promise<ApiResult<T>>; result?: ApiResult<T>; sentAt: number } | undefined;

  /** Whether the set fetched ahead is on its way, or came and can still be used. */
  const isUsable = () =>
    !!ahead &&
    (!ahead.result ||
      (ahead.result.ok && optionsUsableUntil(ahead.sentAt, ahead.result.data) > Date.now()));

  /** Asks for the next click's options, unless a usable set is on its way or waiting. */
  const prefetch = () => {
    if (isUsable()) return;
    const entry: NonNullable<typeof ahead> = { pending: fetch(), sentAt: Date.now() };
    void entry.pending.then((result) => (entry.result = result));
    ahead = entry;
  };

  const take = async (): Promise<{ result: ApiResult<T>; fetched: boolean }> => {
    const entry = isUsable() ? ahead! : undefined;
    ahead = undefined;
    // One still on its way is waited for, failure or not, and counts as a wait.
    // A set got ahead goes to the prompt with only the time its challenge has left.
    if (entry?.result?.ok) {
      return {
        result: { ...entry.result, data: forPrompt(entry.sentAt, entry.result.data) },
        fetched: false
      };
    }
    if (entry) return { result: await entry.pending, fetched: true };
    return { result: await fetch(), fetched: true };
  };

  return { prefetch, take };
};

/**
 * How long before the API's challenge ends a set of options stops being reused: a prompt can stay
 * open a while, and an answer to an ended challenge wastes the try (or, for a new passkey, leaves
 * it on the device).
 */
const OPTIONS_REUSE_MARGIN_MS = 60_000;

/** Until when options asked for at `sentAt` may still be used: their `timeout`, less the margin. */
export const optionsUsableUntil = (sentAt: number, options: { timeout?: number }) =>
  sentAt + (options.timeout ?? 0) - OPTIONS_REUSE_MARGIN_MS;

/** Time kept for the answer to reach the API before the challenge ends. */
const ANSWER_ALLOWANCE_MS = 10_000;

/**
 * Options asked for at `sentAt`, for a prompt opening now: the browser counts their `timeout` from
 * the prompt, so it gets only what the API's challenge has left, less the answer's way there.
 */
export const forPrompt = <T extends { timeout?: number }>(sentAt: number, options: T): T =>
  options.timeout === undefined
    ? options
    : {
        ...options,
        timeout: Math.max(0, sentAt + options.timeout - Date.now() - ANSWER_ALLOWANCE_MS)
      };

const loginOptions = optionsAhead(() =>
  apiRequest(Endpoints.Auth.passkeyOptions, { failure: Messages.Passkeys.optionsFailed })
);

/** Gets the login's options ready, e.g. once the pointer or the focus reaches its key. */
export const prefetchPasskeyLogin = loginOptions.prefetch;

/** A name only gets too long by typing more: shown while typing. */
export const passkeyNameEarlyError = (name: string) =>
  displayNameEarlyError(name, Limits.Passkey.nameMaxLength, Messages.Passkeys);

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
