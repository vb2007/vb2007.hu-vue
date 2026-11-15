import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import MfaStep from "@/components/features/auth/MfaStep.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { clearSession, forgetLogin, loginStatus, startMfa } from "@/scripts/authentication/user";
import { descriptionOf } from "@/__tests__/helpers/description";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import type { MfaMethod } from "@/types/api/mfa";

const SENT = "A code and a login link were sent to the account's e-mail address.";
const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";
const TOO_MANY = "Too many failed attempts: try again later.";
const MAIL_FAILED = "The e-mail couldn't be sent: please try again later.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

const mountStep = (methods: MfaMethod[] = ["email", "recovery"]) => {
  startMfa(methods);
  wrapper = mount(MfaStep, { props: { methods }, attachTo: document.body });
  return wrapper;
};

const keyNamed = (step: VueWrapper, text: string) =>
  step.findAll("button").find((button) => button.text() === text)!;

/** Asks for the mail and lets it answer 202. */
const sendCode = async (step: VueWrapper) => {
  fetchMock.mockResolvedValueOnce(jsonResponse(202, { message: SENT }));
  await keyNamed(step, "E-mail me a code").trigger("click");
  await flushPromises();
};

describe("MfaStep", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    forgetLogin();
    clearSession();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  it("opens with the e-mail method, its lead line focused, and mails nothing by itself", () => {
    const step = mountStep();

    expect(step.find("h2").text()).toBe("E-mail code");
    expect(document.activeElement).toBe(step.find(".mfa__lead").element);
    expect(step.text()).toContain("The link only works in this browser.");
    expect(step.find("input").exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("offers no method it can't do yet, and says so when none is left", () => {
    const step = mountStep(["passkey", "recovery"]);

    expect(step.find('[role="alert"]').text()).toBe(
      "Your account's second step uses a method this site can't do yet. Ask the site's admin to reset it, then log in again."
    );
    expect(step.find(".mfa__others").exists()).toBe(false);
  });

  it("mails a code, then puts the cursor in its field, described by where it went", async () => {
    const step = mountStep();

    await sendCode(step);

    const field = step.find("input");
    expect(document.activeElement).toBe(field.element);
    expect(descriptionOf(field)).toContain(
      "A code and a link are on their way to your account's e-mail address."
    );
    expect(descriptionOf(field)).toContain(
      "This step works for 10 minutes after you logged in, with 5 tries in all."
    );
    expect(field.attributes("autocomplete")).toBe("one-time-code");
    const sendKey = step.find(".email__send button");
    expect(sendKey.text()).toMatch(/^Send again in 60\ssec$/);
    expect(sendKey.attributes("disabled")).toBeDefined();
  });

  it("logs in with the right code, spaces dropped", async () => {
    const step = mountStep();
    await sendCode(step);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Login successful with user me." }))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com" }));

    await step.find("input").setValue("123 456");
    await step.find("form").trigger("submit");
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[1][1]!.body as string)).toEqual({
      method: "email",
      code: "123456"
    });
    expect(isLoggedIn.value).toBe(true);
    expect(loginStatus.value).toBe("success");
  });

  it("checks the code before sending it", async () => {
    const step = mountStep();
    await sendCode(step);

    await step.find("input").setValue("12a");
    expect(step.find(".field__error").text()).toBe("Enter the 6-digit code from the e-mail.");
    // Too short shows once the field is left.
    await step.find("input").setValue("12");
    expect(step.find(".field__error").exists()).toBe(false);
    await step.find("input").trigger("blur");
    expect(step.find(".field__error").text()).toBe("Enter the 6-digit code from the e-mail.");
    await step.find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a wrong code as the field's error, keeps the cursor there, and drops it once edited", async () => {
    const step = mountStep();
    await sendCode(step);
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: WRONG_CODE }));

    await step.find("input").setValue("000000");
    await step.find("form").trigger("submit");
    await flushPromises();

    expect(step.find(".field__error").text()).toBe(WRONG_CODE);
    expect(document.activeElement).toBe(step.find("input").element);
    await step.find("input").setValue("000001");
    expect(step.find(".field__error").exists()).toBe(false);
  });

  it("holds Log in after the daily limit's 429, counting its wait down", async () => {
    const step = mountStep();
    await sendCode(step);
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 900 }));

    await step.find("input").setValue("123456");
    await step.find("form").trigger("submit");
    await flushPromises();

    const key = step.find('button[type="submit"]');
    expect(key.text()).toBe("Try again in 15 min");
    expect(key.attributes("disabled")).toBeDefined();
    expect(step.find('[role="alert"]').text()).toContain(TOO_MANY);
  });

  it("keeps the code field after a failed send, with the cursor in it", async () => {
    vi.useFakeTimers();
    const step = mountStep();
    await sendCode(step);
    vi.advanceTimersByTime(60_000);
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: MAIL_FAILED }));

    await keyNamed(step, "Send a new code").trigger("click");
    await flushPromises();

    expect(step.find("input").exists()).toBe(true);
    expect(step.find('[role="alert"]').text()).toBe(MAIL_FAILED);
    expect(document.activeElement).toBe(step.find("input").element);
  });

  it("empties the field for a new code, which voids the one typed", async () => {
    vi.useFakeTimers();
    const step = mountStep();
    await sendCode(step);
    await step.find("input").setValue("12");
    vi.advanceTimersByTime(60_000);
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { message: SENT }));

    await keyNamed(step, "Send a new code").trigger("click");
    await flushPromises();

    const field = step.find("input");
    expect((field.element as HTMLInputElement).value).toBe("");
    expect(step.find(".field__error").exists()).toBe(false);
    expect(document.activeElement).toBe(field.element);
  });

  it("names a long wait in words for the waiting send key", async () => {
    const step = mountStep();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many.", reason: "mfaEmailLimit", retryAfter: 1800 })
    );

    await keyNamed(step, "E-mail me a code").trigger("click");
    await flushPromises();

    const key = step.find(".email__send button");
    expect(key.text()).toMatch(/^Send again in 30\smin$/);
    expect(key.attributes("aria-label")).toMatch(/^Send again in 30\sminutes$/);
    expect(descriptionOf(key)).toBe("Too many.");
    // No field yet, so the message takes the cursor the disabled key lost.
    expect(document.activeElement).toBe(step.find(".email__error").element);
  });

  it("leaves with Log in again", async () => {
    const step = mountStep();

    await keyNamed(step, "Log in again").trigger("click");

    expect(step.emitted("back")).toHaveLength(1);
  });
});
