import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, type VueWrapper } from "@vue/test-utils";
import PasswordResetForm from "@/components/features/auth/PasswordResetForm.vue";
import {
  confirmPasswordReset,
  requestPasswordReset,
  type PasswordResetAnswer
} from "@/scripts/authentication/passwordReset";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/passwordReset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/passwordReset")>()),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn()
}));

const SENT = "If an account uses this address, a password reset code was sent to it.";
const RESENT =
  "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works.";
const RECENT =
  "If an account uses this address, a code was sent to it in the last minute and still works.";
const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";
const TOO_MANY = "Too many e-mails requested: try again later.";

enableAutoUnmount(afterEach);

const submitButton = (wrapper: VueWrapper) => wrapper.find('button[type="submit"]');
const resendButton = (wrapper: VueWrapper) => wrapper.find(".resend button");
const changeButton = (wrapper: VueWrapper) => wrapper.find(".sent-to button");
const enterCodeButton = (wrapper: VueWrapper) => wrapper.find(".alt button");
const emailInput = (wrapper: VueWrapper) => wrapper.find('input[type="email"]');
const codeInput = (wrapper: VueWrapper) => wrapper.find('input[inputmode="numeric"]');

/** An answer the test settles itself, to look at the form while it waits. */
const pendingAnswer = () => {
  let settle!: (answer: PasswordResetAnswer) => void;
  const answer = new Promise<PasswordResetAnswer>((resolve) => (settle = resolve));
  return { answer, settle };
};

/** Fills in `address` on the e-mail step and sends it. */
const sendTo = async (wrapper: VueWrapper, address: string) => {
  await emailInput(wrapper).setValue(address);
  await wrapper.find("form").trigger("submit");
  await flushPromises();
};

/** Mounts the form and sends a code to me@example.com, landing on the code step. */
const mountOnCodeStep = async () => {
  vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });
  const mounted = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
  await sendTo(mounted.wrapper, "me@example.com");
  return mounted;
};

const fillCodeStep = async (wrapper: VueWrapper, code = "123456", password = "new password") => {
  const [, codeField, passwordField] = wrapper.findAll("input");
  await codeField.setValue(code);
  await passwordField.setValue(password);
};

/** Lets the resend countdown run out. */
const waitOutCountdown = async () => {
  vi.advanceTimersByTime(60_000);
  await flushPromises();
};

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(requestPasswordReset).mockReset();
    vi.mocked(confirmPasswordReset).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  it("asks for the e-mail address first, with ways to enter a code or log in", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm);

    expect(wrapper.find("h1").text()).toBe("Reset password");
    expect(wrapper.findAll("input")).toHaveLength(1);
    expect(emailInput(wrapper).attributes("autocomplete")).toBe("email");
    expect(submitButton(wrapper).text()).toBe("Send code");
    expect(enterCodeButton(wrapper).text()).toBe("Enter it");
    expect(wrapper.find('a[href="/login"]').text()).toBe("Log in");
  });

  it("sends the code, showing progress meanwhile", async () => {
    const { answer, settle } = pendingAnswer();
    vi.mocked(requestPasswordReset).mockReturnValueOnce(answer);
    const { wrapper } = await mountWithRouter(PasswordResetForm);
    await emailInput(wrapper).setValue("me@example.com");

    await wrapper.find("form").trigger("submit");

    expect(requestPasswordReset).toHaveBeenCalledWith("me@example.com");
    expect(submitButton(wrapper).text()).toBe("Sending");
    expect(enterCodeButton(wrapper).attributes("disabled")).toBeDefined();

    settle({ message: SENT });
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
  });

  it("moves to the code step, naming the address and focusing the code, described by the message", async () => {
    const { wrapper } = await mountOnCodeStep();

    expect(wrapper.find(".sent-to__address").text()).toBe("me@example.com");
    const [username, code, password] = wrapper.findAll("input");
    // Tells password managers which login the new password belongs to.
    expect(username.attributes()).toMatchObject({ autocomplete: "username", hidden: "" });
    expect((username.element as HTMLInputElement).value).toBe("me@example.com");
    expect(code.attributes()).toMatchObject({
      inputmode: "numeric",
      autocomplete: "one-time-code"
    });
    expect(document.activeElement).toBe(code.element);
    const status = wrapper.find('[role="status"]');
    const hint = wrapper.find(".field__hint");
    expect(hint.text()).toBe("The 6-digit code from the e-mail. It works for 30 minutes.");
    expect(code.attributes("aria-describedby")).toBe(
      `${status.attributes("id")} ${hint.attributes("id")}`
    );
    expect(password.attributes()).toMatchObject({
      type: "password",
      autocomplete: "new-password"
    });
    expect(wrapper.text()).toContain("8 to 128 characters.");
    expect(submitButton(wrapper).text()).toBe("Reset password");
  });

  it("stays on the e-mail step with the API's error, without holding anything back", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 60 });
    const { wrapper } = await mountWithRouter(PasswordResetForm);

    await sendTo(wrapper, "me@example.com");

    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(submitButton(wrapper).classes()).toContain("btn--error");
    expect(emailInput(wrapper).exists()).toBe(true);

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(submitButton(wrapper).classes()).not.toContain("btn--error");

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Send again");
  });

  it("counts down before a code can be sent again", async () => {
    const { wrapper } = await mountOnCodeStep();

    expect(resendButton(wrapper).text()).toBe("Send again in 1:00");
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();

    vi.advanceTimersByTime(51_000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Send again in 0:09");

    vi.advanceTimersByTime(9000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Send again");
    expect(resendButton(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("sends the code again, says so, restarts the countdown and returns to an empty code", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "000000");
    await waitOutCountdown();
    const { answer, settle } = pendingAnswer();
    vi.mocked(requestPasswordReset).mockReturnValueOnce(answer);

    await resendButton(wrapper).trigger("click");

    expect(requestPasswordReset).toHaveBeenLastCalledWith("me@example.com");
    expect(resendButton(wrapper).text()).toBe("Sending");
    expect(changeButton(wrapper).attributes("disabled")).toBeDefined();

    settle({ message: SENT });
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(RESENT);
    expect(resendButton(wrapper).text()).toBe("Send again in 1:00");
    expect(changeButton(wrapper).attributes("disabled")).toBeUndefined();
    expect(document.activeElement).toBe(codeInput(wrapper).element);
    expect((codeInput(wrapper).element as HTMLInputElement).value).toBe("");
  });

  it("shows the mail limit's error on a resend and waits as long as it says", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "123456");
    await waitOutCountdown();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 90 });

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
    expect(resendButton(wrapper).text()).toBe("Send again in 1:30");
    expect(document.activeElement).toBe(codeInput(wrapper).element);
    // No new code was sent, so the one typed may still be right.
    expect((codeInput(wrapper).element as HTMLInputElement).value).toBe("123456");
  });

  it("keeps the key ready after a resend error without a wait", async () => {
    const { wrapper } = await mountOnCodeStep();
    await waitOutCountdown();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: "Error connecting to server" });

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
    expect(resendButton(wrapper).text()).toBe("Send again");
  });

  it("goes back to change the address, keeping it and its countdown", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper);

    await changeButton(wrapper).trigger("click");
    await flushPromises();

    expect((emailInput(wrapper).element as HTMLInputElement).value).toBe("me@example.com");
    expect(document.activeElement).toBe(emailInput(wrapper).element);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    // The API wouldn't send this address another code yet, so nothing is asked for.
    vi.advanceTimersByTime(20_000);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(requestPasswordReset).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
    expect(resendButton(wrapper).text()).toBe("Send again in 0:40");
    const [, code, password] = wrapper.findAll("input");
    expect((code.element as HTMLInputElement).value).toBe("");
    expect((password.element as HTMLInputElement).value).toBe("");
  });

  it("sends a code to a new address right away", async () => {
    const { wrapper } = await mountOnCodeStep();
    await changeButton(wrapper).trigger("click");
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });

    vi.advanceTimersByTime(20_000);
    await sendTo(wrapper, "other@example.com");

    expect(requestPasswordReset).toHaveBeenLastCalledWith("other@example.com");
    expect(wrapper.find(".sent-to__address").text()).toBe("other@example.com");
    expect(resendButton(wrapper).text()).toBe("Send again in 1:00");
  });

  it("enters a code that already arrived without sending another", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await emailInput(wrapper).setValue("me@example.com");

    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find(".sent-to__address").text()).toBe("me@example.com");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(codeInput(wrapper).attributes("aria-describedby")).toBe(
      wrapper.find(".field__hint").attributes("id")
    );
    expect(document.activeElement).toBe(codeInput(wrapper).element);
    expect(resendButton(wrapper).text()).toBe("Send again");
  });

  it("keeps the countdown through a reload, for entering the code that already arrived", async () => {
    const first = await mountOnCodeStep();
    vi.advanceTimersByTime(20_000);
    first.wrapper.unmount();

    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await emailInput(wrapper).setValue("Me@Example.com");
    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(requestPasswordReset).toHaveBeenCalledOnce();
    expect(resendButton(wrapper).text()).toBe("Send again in 0:40");
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("goes back to the code without a request when the address's code is still recent after a reload", async () => {
    const first = await mountOnCodeStep();
    vi.advanceTimersByTime(20_000);
    first.wrapper.unmount();

    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await sendTo(wrapper, "me@example.com");

    expect(requestPasswordReset).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="status"]').text()).toBe(RECENT);
    expect(resendButton(wrapper).text()).toBe("Send again in 0:40");
  });

  it("doesn't hold back another address after a reload", async () => {
    const first = await mountOnCodeStep();
    first.wrapper.unmount();

    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await emailInput(wrapper).setValue("other@example.com");
    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(resendButton(wrapper).text()).toBe("Send again");
  });

  it("asks for a valid address before entering a code", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm);

    await enterCodeButton(wrapper).trigger("click");
    await emailInput(wrapper).setValue("not an address");
    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(emailInput(wrapper).exists()).toBe(true);
  });

  it("checks the password's length before sending it", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "123456", "short");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(confirmPasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      "The password's too short: it must be between 8 and 128 characters."
    );
    expect(submitButton(wrapper).classes()).toContain("btn--error");
  });

  it("shows the API's error for a wrong code and stays on the step", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "000000");
    vi.mocked(confirmPasswordReset).mockResolvedValueOnce({ error: WRONG_CODE });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(WRONG_CODE);
    expect(submitButton(wrapper).text()).toBe("Reset password");
    expect(wrapper.find(".sent-to__address").text()).toBe("me@example.com");
  });

  it("resets the password and sends the user to log in", async () => {
    const { wrapper, router } = await mountOnCodeStep();
    await fillCodeStep(wrapper, " 123 456 ");
    const { answer, settle } = pendingAnswer();
    vi.mocked(confirmPasswordReset).mockReturnValueOnce(answer);

    await wrapper.find("form").trigger("submit");

    expect(confirmPasswordReset).toHaveBeenCalledWith(
      "me@example.com",
      " 123 456 ",
      "new password"
    );
    expect(submitButton(wrapper).text()).toBe("Resetting");

    settle({ message: "Password reset successfully: log in with the new password." });
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
  });
});
