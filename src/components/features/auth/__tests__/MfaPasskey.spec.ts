import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import MfaStep from "@/components/features/auth/MfaStep.vue";
import { Messages } from "@/constants/messages";
import { NO_MFA } from "@/scripts/authentication/authState";
import {
  clearSession,
  forgetLogin,
  loginStatus,
  mfaMethods,
  startMfa
} from "@/scripts/authentication/user";
import { getPasskey } from "@/scripts/authentication/webauthn";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import type { MfaMethod } from "@/types/api/mfa";

vi.mock("@/scripts/authentication/webauthn", () => ({
  passkeysSupported: () => true,
  getPasskey: vi.fn()
}));

const INVALID = "The passkey couldn't be verified: try again or log in another way.";
const EXPIRED =
  "The login's second step expired, used up its tries or was never started: log in again.";
const TOO_MANY = "Too many failed attempts: try again later.";
const OPTIONS = { challenge: "abc", allowCredentials: [{ id: "cred-1", type: "public-key" }] };
const RESPONSE = { id: "cred-1" };

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

const mountStep = (methods: MfaMethod[] = ["email", "passkey", "recovery"]) => {
  startMfa(methods);
  wrapper = mount(MfaStep, { props: { methods }, attachTo: document.body });
  return wrapper;
};

const passkeyKey = (step: VueWrapper) => step.find(".passkey button");

describe("MfaStep's passkey", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(getPasskey).mockReset();
    vi.mocked(getPasskey).mockResolvedValue({ ok: true, response: RESPONSE });
    forgetLogin();
    clearSession();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("opens before the e-mail code, which stays under Other ways", () => {
    const step = mountStep();

    expect(step.find("h2").text()).toBe("Passkey");
    expect(passkeyKey(step).text()).toBe("Use a passkey");
    expect(step.find(".mfa__others").text()).toContain("Use an e-mail code");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks for the step's options, runs the prompt and finishes the login", async () => {
    const step = mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockResolvedValueOnce(jsonResponse(200, { _id: "1", username: "vb", mfa: NO_MFA }));

    // Twice before the key turns busy: one try.
    (passkeyKey(step).element as HTMLButtonElement).click();
    (passkeyKey(step).element as HTMLButtonElement).click();
    await step.vm.$nextTick();
    expect(passkeyKey(step).text()).toBe("Logging in");
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/auth/mfa/passkey/options", {
      method: "POST",
      credentials: "include"
    });
    expect(getPasskey).toHaveBeenCalledOnce();
    expect(getPasskey).toHaveBeenCalledWith(OPTIONS);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/auth/mfa/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "passkey", response: RESPONSE })
    });
    expect(loginStatus.value).toBe("success");
  });

  it("shows the API's refusal above the key, which takes the focus back", async () => {
    const step = mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(400, { error: INVALID }));

    await passkeyKey(step).trigger("click");
    await flushPromises();

    expect(step.find('[role="alert"]').text()).toBe(INVALID);
    expect(document.activeElement).toBe(passkeyKey(step).element);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("says nothing for a cancelled prompt, and the next try starts clean", async () => {
    const step = mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(400, { error: INVALID }))
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    await passkeyKey(step).trigger("click");
    await flushPromises();
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    await passkeyKey(step).trigger("click");
    await flushPromises();

    expect(step.find('[role="alert"]').exists()).toBe(false);
    expect(document.activeElement).toBe(passkeyKey(step).element);
  });

  it("shows why the browser couldn't, or the options failed", async () => {
    const step = mountStep();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    vi.mocked(getPasskey).mockResolvedValueOnce({
      ok: false,
      error: Messages.Passkeys.browserFailed
    });
    await passkeyKey(step).trigger("click");
    await flushPromises();
    expect(step.find('[role="alert"]').text()).toBe(Messages.Passkeys.browserFailed);

    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    await passkeyKey(step).trigger("click");
    await flushPromises();
    expect(step.find('[role="alert"]').text()).toBe(`${Messages.Passkeys.optionsFailed}: 500`);
  });

  it("goes back to the password when the step expired", async () => {
    const step = mountStep();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: EXPIRED }));

    await passkeyKey(step).trigger("click");
    await flushPromises();

    expect(getPasskey).not.toHaveBeenCalled();
    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe(EXPIRED);
  });

  it("holds the key after the day's 429, its message taking the focus", async () => {
    const step = mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
      .mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 900 }));

    await passkeyKey(step).trigger("click");
    await flushPromises();

    expect(passkeyKey(step).text()).toBe("Try again in 15 min");
    expect(passkeyKey(step).attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(step.find('[role="alert"]').element);
    await passkeyKey(step).trigger("click");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
