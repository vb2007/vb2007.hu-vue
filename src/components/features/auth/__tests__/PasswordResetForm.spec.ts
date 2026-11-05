import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, type VueWrapper } from "@vue/test-utils";
import PasswordResetForm from "@/components/features/auth/PasswordResetForm.vue";
import { isLoggedIn, userEmail, userId } from "@/scripts/authentication/authState";
import {
  confirmPasswordReset,
  confirmPasswordResetLink,
  requestPasswordReset,
  type PasswordResetAnswer
} from "@/scripts/authentication/passwordReset";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/passwordReset", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/passwordReset")>()),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  confirmPasswordResetLink: vi.fn()
}));

const SENT = "If an account uses this address, a password reset code was sent to it.";
const RESENT =
  "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works.";
const RECENT =
  "If an account uses this address, a code was sent to it in the last minute and still works.";
const WRONG_CODE = "The code is wrong, expired or already used: check it or request a new one.";
const TOO_MANY = "Too many e-mails requested: try again later.";
const USER_ID = "0123456789abcdef01234567";
const TOKEN = `${USER_ID}.${"a".repeat(40)}-_9`;
const BAD_LINK = "The reset link is wrong, expired or already used: request a new one.";
const MALFORMED = "This reset link isn't complete or was changed: request a new one.";

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

/** The link step's one visible field. */
const linkPassword = (wrapper: VueWrapper) => wrapper.find('input[type="password"]');

/** Opens the page from a mailed link carrying `token`. */
const mountFromLink = (token = TOKEN, query = "") =>
  mountWithRouter(
    PasswordResetForm,
    { attachTo: document.body },
    `/reset-password${query}#token=${token}`
  );

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
    vi.mocked(confirmPasswordResetLink).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
    isLoggedIn.value = false;
    userEmail.value = "";
    userId.value = "";
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

    expect(resendButton(wrapper).text()).toBe("Send again in 60 sec");
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();

    vi.advanceTimersByTime(51_000);
    await flushPromises();
    expect(resendButton(wrapper).text()).toBe("Send again in 9 sec");

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
    expect(resendButton(wrapper).text()).toBe("Send again in 60 sec");
    expect(changeButton(wrapper).attributes("disabled")).toBeUndefined();
    expect(document.activeElement).toBe(codeInput(wrapper).element);
    expect((codeInput(wrapper).element as HTMLInputElement).value).toBe("");
  });

  it("shows the mail limit's error on a resend and waits as long as it says", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "123456");
    await waitOutCountdown();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 3412 });

    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
    expect(resendButton(wrapper).text()).toBe("Send again in 57 min");
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
    expect(resendButton(wrapper).text()).toBe("Send again in 40 sec");
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
    expect(resendButton(wrapper).text()).toBe("Send again in 60 sec");
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
    expect(resendButton(wrapper).text()).toBe("Send again in 40 sec");
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
    expect(resendButton(wrapper).text()).toBe("Send again in 40 sec");
  });

  /** On the code step for me@example.com, with "Send again" refused by the mail limit. */
  const mountRateLimited = async () => {
    const mounted = await mountOnCodeStep();
    await waitOutCountdown();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 3412 });
    await resendButton(mounted.wrapper).trigger("click");
    await flushPromises();
    return mounted;
  };

  it("drops the mail limit's message once its wait is over", async () => {
    const { wrapper } = await mountRateLimited();
    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(resendButton(wrapper).attributes("aria-label")).toBe("Send again in 57 minutes");

    vi.advanceTimersByTime(3_412_000);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(resendButton(wrapper).text()).toBe("Send again");
    expect(resendButton(wrapper).attributes("aria-label")).toBeUndefined();
  });

  it("points the waiting key at the mail limit's message, and names hours by the visible label", async () => {
    const { wrapper } = await mountOnCodeStep();
    await waitOutCountdown();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 3900 });
    await resendButton(wrapper).trigger("click");
    await flushPromises();

    expect(resendButton(wrapper).text()).toBe("Send again in 1 hr 5 min");
    // "1 hour 5 minutes" wouldn't contain what the key shows.
    expect(resendButton(wrapper).attributes("aria-label")).toBeUndefined();
    expect(resendButton(wrapper).attributes("aria-describedby")).toBe(
      wrapper.find('[role="alert"]').attributes("id")
    );
  });

  it("keeps a wrong code's error when the mail limit's wait ends", async () => {
    const { wrapper } = await mountRateLimited();
    vi.mocked(confirmPasswordReset).mockResolvedValueOnce({ error: WRONG_CODE });
    await fillCodeStep(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(resendButton(wrapper).attributes("aria-describedby")).toBeUndefined();

    vi.advanceTimersByTime(3_412_000);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(WRONG_CODE);
  });

  it("keeps the mail limit's error for another address when the first one's wait ends", async () => {
    const { wrapper } = await mountRateLimited();
    await changeButton(wrapper).trigger("click");
    await flushPromises();
    vi.mocked(requestPasswordReset).mockResolvedValueOnce({ error: TOO_MANY, retryAfter: 3412 });
    vi.advanceTimersByTime(3_000_000);
    await sendTo(wrapper, "other@example.com");
    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);

    vi.advanceTimersByTime(412_000);
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
  });

  it("keeps another error when the countdown ends", async () => {
    const { wrapper } = await mountOnCodeStep();
    vi.mocked(confirmPasswordReset).mockResolvedValueOnce({ error: WRONG_CODE });
    await fillCodeStep(wrapper);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    await waitOutCountdown();

    expect(wrapper.find('[role="alert"]').text()).toBe(WRONG_CODE);
  });

  it("says it's the mail limit, not a recent code, when coming back to its wait after a reload", async () => {
    const first = await mountRateLimited();
    first.wrapper.unmount();

    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await sendTo(wrapper, "me@example.com");

    // Nothing is asked for: the wait is still the mail limit's, and no code went out a minute ago.
    expect(requestPasswordReset).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(resendButton(wrapper).text()).toBe("Send again in 57 min");
  });

  it("says why the key waits when entering a code after a reload during the mail limit", async () => {
    const first = await mountRateLimited();
    first.wrapper.unmount();

    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await emailInput(wrapper).setValue("me@example.com");
    await enterCodeButton(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
    expect(resendButton(wrapper).attributes("disabled")).toBeDefined();
  });

  it("shows the earlier message again within the page during the mail limit's wait", async () => {
    const { wrapper } = await mountRateLimited();
    await changeButton(wrapper).trigger("click");
    await flushPromises();

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(SENT);
    expect(wrapper.find('[role="alert"]').text()).toBe(TOO_MANY);
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
    expect(wrapper.find(".field__error").text()).toBe("Enter a valid e-mail address.");
  });

  it("checks the address before sending a code", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    expect(submitButton(wrapper).attributes("aria-disabled")).toBe("true");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(requestPasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find(".field__error").text()).toBe("Enter a valid e-mail address.");
    expect(document.activeElement).toBe(emailInput(wrapper).element);
    expect(submitButton(wrapper).classes()).toContain("btn--error");
    wrapper.unmount();
  });

  it("checks each field once it's left", async () => {
    const { wrapper } = await mountWithRouter(PasswordResetForm, { attachTo: document.body });
    await emailInput(wrapper).setValue("me");
    await emailInput(wrapper).trigger("blur");
    expect(wrapper.find(".field__error").text()).toBe("Enter a valid e-mail address.");
    wrapper.unmount();

    const { wrapper: codeStep } = await mountOnCodeStep();
    await fillCodeStep(codeStep, "12", "short");
    expect(codeStep.find(".field__error").exists()).toBe(false);
    expect(submitButton(codeStep).attributes("aria-disabled")).toBe("true");
    await codeInput(codeStep).trigger("blur");
    await codeStep.find('input[type="password"]').trigger("blur");

    expect(codeStep.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter the 6-digit code from the e-mail.",
      "The password's too short: it must be between 8 and 128 characters."
    ]);
  });

  it("checks the password's length before sending it", async () => {
    const { wrapper } = await mountOnCodeStep();
    await fillCodeStep(wrapper, "123456", "short");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(confirmPasswordReset).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find(".field__error").text()).toBe(
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

  it("leaves a fragment without a token alone", async () => {
    const { wrapper, router } = await mountWithRouter(PasswordResetForm, {}, "/reset-password#top");
    await flushPromises();

    expect(router.currentRoute.value.hash).toBe("#top");
    expect(submitButton(wrapper).text()).toBe("Send code");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  describe("from the mailed link", () => {
    it("drops the token from the address, keeping the rest", async () => {
      const { router } = await mountFromLink(TOKEN, "?from=mail");
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe("/reset-password?from=mail");
    });

    it("asks only for the new password, focused, with ways to get a new link or log in", async () => {
      const { wrapper } = await mountFromLink();
      await flushPromises();

      expect(wrapper.findAll("input")).toHaveLength(1);
      expect(linkPassword(wrapper).attributes("autocomplete")).toBe("new-password");
      expect(document.activeElement).toBe(linkPassword(wrapper).element);
      expect(wrapper.text()).toContain(
        "Choose a new password for your account. The link from the e-mail works once, for 30 minutes after it was sent."
      );
      expect(wrapper.text()).toContain("8 to 128 characters.");
      expect(submitButton(wrapper).text()).toBe("Reset password");
      expect(wrapper.find(".alt p").text()).toBe("Link not working? Request a new one");
      expect(wrapper.find('a[href="/login"]').text()).toBe("Log in");
    });

    it("reads a link opened in a tab already on the page, where only the fragment changes", async () => {
      const { wrapper, router } = await mountWithRouter(
        PasswordResetForm,
        { attachTo: document.body },
        "/reset-password"
      );
      vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });
      await sendTo(wrapper, "me@example.com");
      await fillCodeStep(wrapper, "123456", "half typed");

      await router.push(`/reset-password#token=${TOKEN}`);
      await flushPromises();

      expect(router.currentRoute.value.fullPath).toBe("/reset-password");
      expect(wrapper.findAll("input")).toHaveLength(1);
      expect((linkPassword(wrapper).element as HTMLInputElement).value).toBe("");
      expect(document.activeElement).toBe(linkPassword(wrapper).element);
    });

    it("names the logged-in user for password managers when the link is theirs", async () => {
      isLoggedIn.value = true;
      userEmail.value = "me@example.com";
      userId.value = USER_ID;
      const { wrapper } = await mountFromLink();

      const username = wrapper.find('input[autocomplete="username"]');
      expect(username.attributes()).toMatchObject({ type: "email", hidden: "" });
      expect((username.element as HTMLInputElement).value).toBe("me@example.com");
    });

    it("has no username for a logged-in user the link isn't for", async () => {
      isLoggedIn.value = true;
      userEmail.value = "someone@example.com";
      userId.value = "76543210fedcba9876543210";
      const { wrapper } = await mountFromLink();

      expect(wrapper.find('input[autocomplete="username"]').exists()).toBe(false);
    });

    it("checks the password once it's left", async () => {
      const { wrapper } = await mountFromLink();

      await linkPassword(wrapper).setValue("short");
      await linkPassword(wrapper).trigger("blur");

      expect(wrapper.find(".field__error").text()).toBe(
        "The password's too short: it must be between 8 and 128 characters."
      );
    });

    it("checks the password's length before sending it", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("short");

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(confirmPasswordResetLink).not.toHaveBeenCalled();
      expect(wrapper.find(".field__error").text()).toBe(
        "The password's too short: it must be between 8 and 128 characters."
      );
    });

    it("resets the password with the token and sends the user to log in", async () => {
      const { wrapper, router } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      const { answer, settle } = pendingAnswer();
      vi.mocked(confirmPasswordResetLink).mockReturnValueOnce(answer);

      await wrapper.find("form").trigger("submit");

      expect(confirmPasswordResetLink).toHaveBeenCalledWith(TOKEN, "new password");
      expect(submitButton(wrapper).text()).toBe("Resetting");
      expect(wrapper.find(".alt button").attributes("disabled")).toBeDefined();

      settle({ message: "Password reset successfully: log in with the new password." });
      await vi.waitFor(() => expect(router.currentRoute.value.path).toBe("/login"));
    });

    it("offers only a new link once the API refused this one", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      vi.mocked(confirmPasswordResetLink).mockResolvedValueOnce({
        error: BAD_LINK,
        linkRefused: true
      });

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(BAD_LINK);
      expect(wrapper.find("form").exists()).toBe(false);
      const key = wrapper.find(".form button");
      expect(key.text()).toBe("Request a new link");
      expect(key.attributes("aria-describedby")).toBe(
        wrapper.find('[role="alert"]').attributes("id")
      );
      expect(key.attributes("aria-describedby")).toBeTruthy();
      expect(key.classes()).toContain("btn--primary");
      expect(document.activeElement).toBe(key.element);
      expect(wrapper.find(".alt").text()).toBe("Remembered it? Log in");
    });

    it("puts a refused password on its field and keeps the link to try another", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      const tooShort = "The password's too short: it must be between 8 and 128 characters.";
      vi.mocked(confirmPasswordResetLink).mockResolvedValueOnce({
        error: tooShort,
        passwordRefused: true
      });

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find(".field__error").text()).toBe(tooShort);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(document.activeElement).toBe(linkPassword(wrapper).element);
      expect(submitButton(wrapper).text()).toBe("Reset password");
      expect(wrapper.find(".alt p").text()).toBe("Link not working? Request a new one");

      // Another password takes the refusal away.
      await linkPassword(wrapper).setValue("another password");
      expect(wrapper.find(".field__error").exists()).toBe(false);
    });

    it("keeps the form for other errors, so the link can be tried again", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      vi.mocked(confirmPasswordResetLink).mockResolvedValueOnce({
        error: "Error connecting to server"
      });

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
      expect(submitButton(wrapper).text()).toBe("Reset password");
      expect(wrapper.find(".alt p").text()).toBe("Link not working? Request a new one");
    });

    it("says the link still works after too many rejected links, and offers a code meanwhile", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      vi.mocked(confirmPasswordResetLink).mockResolvedValueOnce({
        error: "Too many failed attempts: try again later.",
        retryAfter: 900
      });

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "Too many failed attempts: try again later. The link wasn't used up: it works until 30 minutes after it was sent."
      );
      expect(submitButton(wrapper).text()).toBe("Reset password");
      expect(wrapper.find(".alt p").text()).toBe("Can't wait? Get a code instead");

      // Trying again later drops the note until the API answers.
      const { answer, settle } = pendingAnswer();
      vi.mocked(confirmPasswordResetLink).mockReturnValueOnce(answer);
      await wrapper.find("form").trigger("submit");
      expect(wrapper.find(".alt p").text()).toBe("Link not working? Request a new one");
      settle({ message: "Password reset successfully: log in with the new password." });
      await flushPromises();
    });

    it("goes to an empty e-mail step for a new link, the code step's checks untouched", async () => {
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("short");
      await linkPassword(wrapper).trigger("blur");

      await wrapper.find(".alt button").trigger("click");
      await flushPromises();

      expect(wrapper.findAll("input")).toHaveLength(1);
      expect((emailInput(wrapper).element as HTMLInputElement).value).toBe("");
      expect(document.activeElement).toBe(emailInput(wrapper).element);
      expect(wrapper.text()).toContain(
        "Enter your account's e-mail address to get a code and a link for a new password."
      );
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);

      // The password typed on the link step doesn't count as typed on the code step.
      vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });
      await sendTo(wrapper, "me@example.com");
      await wrapper.find('input[type="password"]').trigger("blur");
      expect(wrapper.find(".field__error").exists()).toBe(false);
    });

    it("fills in the address of the logged-in user whose link was refused", async () => {
      isLoggedIn.value = true;
      userEmail.value = "me@example.com";
      userId.value = USER_ID;
      const { wrapper } = await mountFromLink();
      await linkPassword(wrapper).setValue("new password");
      vi.mocked(confirmPasswordResetLink).mockResolvedValueOnce({
        error: BAD_LINK,
        linkRefused: true
      });
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      await wrapper.find(".form button").trigger("click");
      await flushPromises();

      expect((emailInput(wrapper).element as HTMLInputElement).value).toBe("me@example.com");
      expect(submitButton(wrapper).text()).toBe("Send code");
    });

    it("falls back to the focused e-mail step for a malformed link, without asking the API", async () => {
      const { wrapper, router } = await mountFromLink("abc");
      await flushPromises();

      expect(router.currentRoute.value.hash).toBe("");
      expect(wrapper.find('[role="alert"]').text()).toBe(MALFORMED);
      expect(submitButton(wrapper).text()).toBe("Send code");
      expect(document.activeElement).toBe(emailInput(wrapper).element);
      expect(confirmPasswordResetLink).not.toHaveBeenCalled();
    });

    it("drops the malformed link's error once the code step opens", async () => {
      const { wrapper } = await mountFromLink("");
      vi.mocked(requestPasswordReset).mockResolvedValueOnce({ message: SENT });

      await sendTo(wrapper, "me@example.com");
      await changeButton(wrapper).trigger("click");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    });
  });
});
