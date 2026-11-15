/**
 * Passkeys (vb2007/vb2007.hu-api#446, #484): the options are WebAuthn's own JSON
 * (`PublicKeyCredentialCreationOptionsJSON`, `PublicKeyCredentialRequestOptionsJSON` from lib.dom).
 */
import type { MessageResponse } from "@/types/api/common";

/**
 * What the browser's `PublicKeyCredential.toJSON()` gives (lib.dom types it as `any`): the site
 * only passes it on, and the API checks it.
 */
export type PasskeyCredentialJSON = Record<string, unknown>;

/** One passkey of `GET /user/passkeys`, with no key material. */
export interface Passkey {
  /** The credential id, which `PATCH` and `DELETE /user/passkeys/:id` take. */
  id: string;
  name: string;
  createdAt: string;
  /** `null` until it first logs in. */
  lastUsedAt: string | null;
}

export interface PasskeysResponse {
  passkeys: Passkey[];
}

/** `POST /user/passkeys`: the name, and the `navigator.credentials.create()` result. */
export interface AddPasskeyBody {
  name: string;
  response: PasskeyCredentialJSON;
}

export interface PasskeyAddedResponse extends MessageResponse {
  passkey: Passkey;
}

/** `PATCH /user/passkeys/:id`: renaming needs no password. */
export interface RenamePasskeyBody {
  name: string;
}

/** `POST /auth/passkey`: the `navigator.credentials.get()` result. */
export interface PasskeyLoginBody {
  response: PasskeyCredentialJSON;
}
