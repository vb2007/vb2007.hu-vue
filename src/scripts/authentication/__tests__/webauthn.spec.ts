import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Messages } from "@/constants/messages";
import { createPasskey, getPasskey, passkeysSupported } from "@/scripts/authentication/webauthn";

const RESPONSE = { id: "cred-1", type: "public-key" };

/** A browser with WebAuthn's JSON methods, whose prompts `create` and `get` answer. */
const stubBrowser = (prompt: () => Promise<unknown>) => {
  class FakeCredential {
    static parseCreationOptionsFromJSON = vi.fn((options: unknown) => ({ parsed: options }));
    static parseRequestOptionsFromJSON = vi.fn((options: unknown) => ({ parsed: options }));
    toJSON() {
      return RESPONSE;
    }
  }
  const credentials = { create: vi.fn(prompt), get: vi.fn(prompt) };
  vi.stubGlobal("PublicKeyCredential", FakeCredential);
  vi.stubGlobal("navigator", { credentials });
  return { FakeCredential, credentials };
};

const creation = { challenge: "abc" } as PublicKeyCredentialCreationOptionsJSON;
const request = { challenge: "abc" } as PublicKeyCredentialRequestOptionsJSON;

describe("webauthn", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("supports passkeys only with WebAuthn's JSON methods", () => {
    expect(passkeysSupported()).toBe(false);
    const { FakeCredential } = stubBrowser(() => Promise.resolve(null));
    expect(passkeysSupported()).toBe(true);
    // @ts-expect-error: an older browser without it.
    delete FakeCredential.parseRequestOptionsFromJSON;
    expect(passkeysSupported()).toBe(false);
  });

  it("creates a passkey from the parsed options and hands on its JSON", async () => {
    const { FakeCredential, credentials } = stubBrowser(async () => new FakeCredential());

    expect(await createPasskey(creation)).toEqual({ ok: true, response: RESPONSE });
    expect(credentials.create).toHaveBeenCalledWith({ publicKey: { parsed: creation } });
  });

  it("asks for a passkey from the parsed options", async () => {
    const { FakeCredential, credentials } = stubBrowser(async () => new FakeCredential());

    expect(await getPasskey(request)).toEqual({ ok: true, response: RESPONSE });
    expect(credentials.get).toHaveBeenCalledWith({ publicKey: { parsed: request } });
  });

  it.each([
    ["no credential", () => Promise.resolve(null)],
    ["a closed prompt", () => Promise.reject(new DOMException("closed", "NotAllowedError"))],
    ["an aborted prompt", () => Promise.reject(new DOMException("aborted", "AbortError"))]
  ])("takes %s as a cancel, with nothing to show", async (_, prompt) => {
    stubBrowser(prompt);

    expect(await getPasskey(request)).toEqual({ ok: false, error: "" });
  });

  it("says the device has a passkey already when creating one it excludes", async () => {
    stubBrowser(() => Promise.reject(new DOMException("excluded", "InvalidStateError")));

    expect(await createPasskey(creation)).toEqual({
      ok: false,
      error: Messages.Passkeys.alreadyOnDevice
    });
    expect(await getPasskey(request)).toEqual({
      ok: false,
      error: Messages.Passkeys.browserFailed
    });
  });

  it("reports any other failure, e.g. options the browser can't parse", async () => {
    stubBrowser(() => Promise.reject(new TypeError("bad options")));

    expect(await createPasskey(creation)).toEqual({
      ok: false,
      error: Messages.Passkeys.browserFailed
    });
  });
});
