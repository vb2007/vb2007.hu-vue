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
const OPTIONS_LIMITED = "Too many passkey requests: try again later.";
const OPTIONS = {
  challenge: "abc",
  timeout: 300_000,
  allowCredentials: [{ id: "cred-1", type: "public-key" }]
};
const NEXT_OPTIONS = { ...OPTIONS, challenge: "def" };
const RESPONSE = { id: "cred-1" };
const OPTIONS_URL = "https://api.test/auth/mfa/passkey/options";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

/** Opens the step on the passkey, whose options it asks for at once: `options` answers that. */
const mountStep = async (options: Response = jsonResponse(200, OPTIONS)) => {
  const methods: MfaMethod[] = ["email", "passkey", "recovery"];
  startMfa(methods);
  fetchMock.mockResolvedValueOnce(options);
  wrapper = mount(MfaStep, { props: { methods }, attachTo: document.body });
  await flushPromises();
  return wrapper;
};

const passkeyKey = (step: VueWrapper) => step.find(".passkey button");
const message = (step: VueWrapper) =>
  step.find(".passkey [role='alert'], .passkey [role='status']");
const click = async (step: VueWrapper) => {
  await passkeyKey(step).trigger("click");
  await flushPromises();
};
const optionsRequests = () => fetchMock.mock.calls.filter(([url]) => url === OPTIONS_URL).length;

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
    vi.useRealTimers();
  });

  it("opens before the e-mail code, with its options asked for already", async () => {
    const step = await mountStep();

    expect(step.find("h2").text()).toBe("Passkey");
    expect(passkeyKey(step).text()).toBe("Use a passkey");
    expect(step.find(".mfa__others").text()).toContain("Use an e-mail code");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(OPTIONS_URL, {
      method: "POST",
      credentials: "include"
    });
  });

  it("runs the prompt with the options it has and finishes the login", async () => {
    const step = await mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user vb." }))
      .mockResolvedValueOnce(jsonResponse(200, { _id: "1", username: "vb", mfa: NO_MFA }));

    // Twice before the key turns busy: one try.
    (passkeyKey(step).element as HTMLButtonElement).click();
    (passkeyKey(step).element as HTMLButtonElement).click();
    await step.vm.$nextTick();
    expect(passkeyKey(step).text()).toBe("Logging in");
    await flushPromises();

    expect(getPasskey).toHaveBeenCalledOnce();
    expect(getPasskey).toHaveBeenCalledWith(OPTIONS);
    expect(optionsRequests()).toBe(1);
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://api.test/auth/mfa/verify", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "passkey", response: RESPONSE })
    });
    expect(loginStatus.value).toBe("success");
  });

  it("shows the API's refusal, gives the key the focus and gets the next try's options", async () => {
    const step = await mountStep();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: INVALID }))
      .mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS));

    await click(step);

    expect(message(step).text()).toBe(INVALID);
    expect(document.activeElement).toBe(passkeyKey(step).element);
    expect(console.error).not.toHaveBeenCalled();
    expect(optionsRequests()).toBe(2);

    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    await click(step);
    expect(getPasskey).toHaveBeenLastCalledWith(NEXT_OPTIONS);
  });

  it("says nothing for a cancelled prompt whose options were ready", async () => {
    const step = await mountStep();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS));
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    await click(step);

    expect(message(step).exists()).toBe(false);
    expect(document.activeElement).toBe(passkeyKey(step).element);
  });

  it("suggests another try when a prompt that waited for its options didn't run", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const step = await mountStep();
    // The options outlived their timeout: the click asks again, and waits.
    vi.setSystemTime(Date.now() + OPTIONS.timeout + 1);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS))
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    vi.mocked(getPasskey).mockResolvedValueOnce({ ok: false, error: "" });

    await click(step);

    expect(getPasskey).toHaveBeenCalledWith(NEXT_OPTIONS);
    expect(message(step).text()).toBe(Messages.Passkeys.noPrompt);
    expect(message(step).attributes("role")).toBe("status");
  });

  it("shows why the browser couldn't, or the options failed", async () => {
    const step = await mountStep(jsonResponse(500));
    // A failure got ahead isn't handed on: the click asks again, and the next try's asked for after.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    await click(step);
    expect(message(step).text()).toBe(`${Messages.Passkeys.optionsFailed}: 500`);
    expect(getPasskey).not.toHaveBeenCalled();

    vi.mocked(getPasskey).mockResolvedValueOnce({
      ok: false,
      error: Messages.Passkeys.browserFailed
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS));
    await click(step);
    expect(message(step).text()).toBe(Messages.Passkeys.browserFailed);
  });

  it("goes back to the password when the step expired", async () => {
    await mountStep(jsonResponse(403, { error: EXPIRED }));

    expect(getPasskey).not.toHaveBeenCalled();
    expect(mfaMethods.value).toEqual([]);
    expect(loginStatus.value).toBe(EXPIRED);
  });

  it("holds the key after the options' 429, asking nothing more meanwhile", async () => {
    const limited = () => jsonResponse(429, { error: OPTIONS_LIMITED, retryAfter: 42 });
    const step = await mountStep(limited());
    fetchMock.mockResolvedValueOnce(limited());

    await click(step);

    expect(message(step).text()).toContain(OPTIONS_LIMITED);
    expect(passkeyKey(step).text()).toBe("Try again in 42 sec");
    expect(passkeyKey(step).attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(message(step).element);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gets options again when it comes back, unless a usable set waits", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const step = await mountStep();
    const switchTo = async (label: string) => {
      await step
        .findAll("button")
        .find((button) => button.text() === label)!
        .trigger("click");
      await flushPromises();
    };

    // Back with the set from the opening still usable: nothing asked.
    await switchTo("Use an e-mail code");
    await switchTo("Use a passkey");
    expect(optionsRequests()).toBe(1);

    // Back after it was used up: a new set.
    fetchMock
      .mockResolvedValueOnce(jsonResponse(400, { error: INVALID }))
      .mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS));
    await click(step);
    expect(optionsRequests()).toBe(2);
    await switchTo("Use an e-mail code");
    await switchTo("Use a passkey");
    expect(optionsRequests()).toBe(2);

    // Back once the waiting set is past its margin: a new set as it opens.
    vi.setSystemTime(Date.now() + OPTIONS.timeout);
    await switchTo("Use an e-mail code");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    await switchTo("Use a passkey");
    expect(optionsRequests()).toBe(3);
  });

  it("asks for none while a try runs, when it comes back meanwhile", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const step = await mountStep();
    // The set from the opening outlives its margin meanwhile, so a prefetch would ask again.
    vi.setSystemTime(Date.now() + OPTIONS.timeout);
    let answer!: (result: { ok: false; error: string }) => void;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, NEXT_OPTIONS));
    vi.mocked(getPasskey).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    await passkeyKey(step).trigger("click");
    await flushPromises();
    expect(optionsRequests()).toBe(2);

    const others = () => step.findAll(".mfa__others button");
    await others()[0].trigger("click");
    await flushPromises();
    await others()
      .find((button) => button.text() === "Use a passkey")!
      .trigger("click");
    await flushPromises();
    expect(optionsRequests()).toBe(2);

    fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
    answer({ ok: false, error: "" });
    await flushPromises();
    // Done, it gets the next try's.
    expect(optionsRequests()).toBe(3);
  });

  it("holds the key after the day's 429, its message taking the focus", async () => {
    const step = await mountStep();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 900 }));

    await click(step);

    expect(passkeyKey(step).text()).toBe("Try again in 15 min");
    expect(passkeyKey(step).attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(message(step).element);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
