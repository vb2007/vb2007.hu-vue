/** Multi-factor login (vb2007/vb2007.hu-api#448): the second step after a right password or GitHub. */
import type { MessageResponse } from "@/types/api/common";
import type { PasskeyCredentialJSON } from "@/types/api/passkeys";

/**
 * A second step's method, in the API's order. `passkey` and `recovery` are backups: the API only
 * lists them next to `email` or `totp`.
 */
export type MfaMethod = "email" | "totp" | "passkey" | "recovery";

/** `GET /auth/mfa`: the methods the waiting second step takes, never empty. */
export interface MfaMethodsResponse {
  methods: MfaMethod[];
}

/**
 * `POST /auth/login`'s 202: the password was right, and the second step waits in the
 * `__Host-VB-MFA` cookie instead of a session.
 */
export interface MfaRequiredResponse extends MfaMethodsResponse {
  mfaRequired: true;
}

/**
 * `POST /auth/mfa/verify`, one member per method: `totp` and `recovery` send a `code` too,
 * `passkey` the `response` of `navigator.credentials.get()`.
 */
export type MfaVerifyBody =
  { method: "passkey"; response: PasskeyCredentialJSON } | { method: "email"; code: string };

/** `POST /auth/mfa/verify-link`: the token of the mailed `/login/mfa#token=…` link. */
export interface MfaLinkBody {
  token: string;
}

/**
 * What an MFA setting takes to confirm it's the user: the password, or nothing on an account made
 * with GitHub, which a GitHub login or relink in the last minutes confirms instead.
 */
export interface MfaPasswordBody {
  password?: string;
}

/**
 * Turning a method on: the account's first method also brings a fresh set of recovery codes, shown
 * only in this answer.
 */
export interface MfaTurnOnResponse extends MessageResponse {
  recoveryCodes?: string[];
}
