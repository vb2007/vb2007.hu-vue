import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, type VueWrapper } from "@vue/test-utils";
import PasswordResetForm from "@/components/features/auth/PasswordResetForm.vue";
import { confirmPasswordReset, requestPasswordReset } from "@/scripts/authentication/passwordReset";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/passwordReset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/passwordReset")>()),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn()
}));

const SENT = "If an account uses this address, a password reset code was sent to it.";
const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";

enableAutoUnmount(afterEach);

const submitButton = (wrapper: VueWrapper) => wrapper.find('button[type="submit"]');
const resendButton = (wrapper: VueWrapper) => wrapper.find(".resend button");

/** Mounts the form and sends a code to me@example.com, landing on the code step. */
const mountOnCodeStep = async () => {
  vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });
  const mounted = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
  await mounted.wrapper.find('input[type="email"]').setValue("me@example.com");
  await mounted.wrapper.find("form").trigger("submit");
  await flushPromises();
  return mounted;
};

const fillCodeStep = async (wrapper: VueWrapper, code = "123456", password = "new password") => {
  const [, codeInput, passwordInput] = wrapper.findAll("input");
  await codeInput.setValue(code);
  await passwordInput.setValue(password);
};

describe("PasswordResetForm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(requestPasswordReset).mockReset();
    vi.mocked(confirmPasswordReset).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("asks for the e-mail address first, with a way back to log in", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm);

    expect(wrapper.find("h1").text()).toBe("Reset password");
    expect(wrapper.findAll("input")).toHaveLength(1);
    expect(wrapper.find('input[type="email"]').attributes("autocomplete")).toBe("email");
    expect(submitButton(wrapper).text()).toBe("Send code");
    expect(wrapper.find('a[href="/login"]').text()).toBe("Log in");
  });

  it("sends the code, showing progress meanwhile", async () => {
    let answer!: (value: { message: string }) => void;
    vi.mocked(requestPasswordReset).mockReturnValueOnce(
      new Promise((resolve) => (answer = resolve))
    );
    const { wrapper } = await mountWithRouter(PasswordResetForm);
    await wrapper.find('input[type="email"]').setValue("me@example.com");

    await wrapper.find("form").trigger("submit");

    expect(requestPasswordReset).toHaveBeenCalledWith("me@example.com");
    expect(submitButton(wrapper).text()).toBe("Sending");

    answer({ message: SENT });
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
  });

  it("moves to the code step, naming the address and focusing the code", async () => {
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
    expect(password.attributes()).toMatchObject({
      type: "password",
      autocomplete: "new-password"
    });
    expect(wrapper.text()).toContain("8 to 128 characters.");
    expect(submitButton(wrapper).text()).toBe("Reset password");
  });

  it("stays on the e-mail step with the API's error", async () => {
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({
      error: "You must provide an E-mail address."
    });
    const { wrapper } = await mountWithRouter(PasswordResetForm);

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("You must provide an E-mail address.");
    expect(submitButton(wrapper).classes()).toContain("btn--error");
    expect(wrapper.find('input[type="email"]').exists()).toBe(true);

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(submitButton(wrapper).classes()).not.toContain("btn--error");
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

  it("sends the code again and restarts the countdown", async () => {
    const { wrapper } = await mountOnCodeStep();
    vi.advanceTimersByTime(60_000);
    await flushPromises();
    let answer!: (value: { message: string }) => void;
    vi.mocked(requestPasswordReset).mockReturnValueOnce(
      new Promise((resolve) => (answer = resolve))
    );

    await resendButton(wrapper).trigger("click");

    expect(requestPasswordReset).toHaveBeenLastCalledWith("me@example.com");
    expect(resendButton(wrapper).text()).toBe("Sending");

    answer({ message: SENT });
    await flushPromises();

    expect(resendButton(wrapper).text()).toBe("Send again in 1:00");
    expect(wrapper.find(".sent-to__address").text()).toBe("me@example.com");
  });

  it("shows the mail limit's error and waits as long as it says", async () => {
    const { wrapper } = await mountOnCodeStep();
    vi.advanceTimersByTime(60_000);
    await flushPromises();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({
      error: "Too many e-mails requested: try again later.",
      retryAfter: 90
    });

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "Too many e-mails requested: try again later."
    );
    expect(resendButton(wrapper).text()).toBe("Send again in 1:30");
  });

  it("goes back to change the address, keeping it to edit", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper);

    await wrapper.find(".sent-to button").trigger("click");
    await flushPromises();

    const email = wrapper.find('input[type="email"]');
    expect((email.element as HTMLInputElement).value).toBe("me@example.com");
    expect(document.activeElement).toBe(email.element);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);

    await email.setValue("other@example.com");
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".sent-to__address").text()).toBe("other@example.com");
    const [, code, password] = wrapper.findAll("input");
    expect((code.element as HTMLInputElement).value).toBe("");
    expect((password.element as HTMLInputElement).value).toBe("");
    expect(resendButton(wrapper).text()).toBe("Send again in 1:00");
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
    let answer!: (value: { message: string }) => void;
    vi.mocked(confirmPasswordReset).mockReturnValueOnce(
      new Promise((resolve) => (answer = resolve))
    );

    await wrapper.find("form").trigger("submit");

    expect(confirmPasswordReset).toHaveBeenCalledWith(
      "me@example.com",
      " 123 456 ",
      "new password"
    );
    expect(submitButton(wrapper).text()).toBe("Resetting");

    answer({ message: "Password reset successfully: log in with the new password." });
    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
  });
});
