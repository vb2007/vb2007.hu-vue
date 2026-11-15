/**
 * The browser's passkey prompts (WebAuthn), kept here so the rest of the site never touches
 * `navigator.credentials`. The API sends and takes WebAuthn's own JSON, which the browser parses
 * and gives back itself, so no library is needed.
 */
import { Messages } from "@/constants/messages";
import type { PasskeyCredentialJSON } from "@/types/api/passkeys";

/** The prompt's outcome. A cancel (`error: ""`) isn't a fault: it's shown as nothing. */
export type PasskeyCeremony =
  { ok: true; response: PasskeyCredentialJSON } | { ok: false; error: string };

/** Whether this browser can run the prompts: it needs WebAuthn's JSON methods (2024-2025 browsers). */
export const passkeysSupported = (): boolean =>
  typeof PublicKeyCredential === "function" &&
  typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function" &&
  typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function" &&
  typeof PublicKeyCredential.prototype.toJSON === "function";

const run = async (
  prompt: () => Promise<Credential | null>,
  onInvalidState = Messages.Passkeys.browserFailed
): Promise<PasskeyCeremony> => {
  try {
    const credential = (await prompt()) as PublicKeyCredential | null;
    if (!credential) return { ok: false, error: "" };
    return { ok: true, response: credential.toJSON() };
  } catch (error) {
    const name = error instanceof DOMException ? error.name : "";
    // The user closed the prompt, or it timed out: browsers don't tell the two apart.
    if (name === "NotAllowedError" || name === "AbortError") return { ok: false, error: "" };
    return {
      ok: false,
      error: name === "InvalidStateError" ? onInvalidState : Messages.Passkeys.browserFailed
    };
  }
};

/** Makes a passkey from `POST /user/passkeys/options`' options. */
export const createPasskey = (options: PublicKeyCredentialCreationOptionsJSON) =>
  run(
    () =>
      navigator.credentials.create({
        publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(options)
      }),
    // The authenticator already holds one of the passkeys the options exclude.
    Messages.Passkeys.alreadyOnDevice
  );

/** Asks for a passkey, for a login or its second step. */
export const getPasskey = (options: PublicKeyCredentialRequestOptionsJSON) =>
  run(() =>
    navigator.credentials.get({
      publicKey: PublicKeyCredential.parseRequestOptionsFromJSON(options)
    })
  );
