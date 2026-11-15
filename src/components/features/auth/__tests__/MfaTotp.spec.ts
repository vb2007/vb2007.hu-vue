import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import MfaStep from "@/components/features/auth/MfaStep.vue";
import { clearSession, forgetLogin, startMfa } from "@/scripts/authentication/user";
import { descriptionOf } from "@/__tests__/helpers/description";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const WRONG = "The code is wrong, expired or already used: check it or request a new one.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

const mountStep = () => {
  startMfa(["totp", "recovery"]);
  wrapper = mount(MfaStep, { props: { methods: ["totp", "recovery"] }, attachTo: document.body });
  return wrapper;
};

describe("MfaStep's authenticator app", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    clearSession();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("asks for the app's code straight away, saying a used one waits for the next", () => {
    const step = mountStep();

    expect(step.find("h2").text()).toBe("Authenticator app");
    const field = step.find("input");
    expect(step.find("label").text()).toBe("Code from your authenticator app");
    expect(field.attributes("inputmode")).toBe("numeric");
    expect(descriptionOf(field)).toBe(
      "Enter the 6-digit code your authenticator app shows for vb2007.hu. It changes every 30 seconds, and each works once: if it was just used, wait for the next. This step works for 10 minutes after you logged in, with 5 tries in all."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checks the code in the app's words, then sends it as a totp answer", async () => {
    const step = mountStep();
    const field = step.find("input");

    await field.setValue("12a");
    expect(step.find(".field__error").text()).toBe(
      "Enter the 6-digit code from your authenticator app."
    );
    await field.setValue("123");
    await step.find("form").trigger("submit");
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG }));
    await field.setValue("123 456");
    await step.find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/mfa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: "totp", code: "123456" }),
      credentials: "include"
    });
    expect(step.find(".field__error").text()).toBe(WRONG);
    expect(document.activeElement).toBe(field.element);
  });
});
