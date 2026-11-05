import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { passwordResetNotice } from "@/scripts/authentication/passwordReset";
import { login, loginStatus, logout, restoreSession } from "@/scripts/authentication/user";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn()
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
    vi.mocked(logout).mockReset();
    vi.mocked(restoreSession).mockReset();
  });

  afterEach(() => {
    loginStatus.value = "";
  });

  it("checks for an existing session on mount", async () => {
    await mountWithRouter(LoginForm);

    expect(restoreSession).toHaveBeenCalledOnce();
  });

  it("submits the credentials and shows progress meanwhile", async () => {
    let finishLogin!: (wait?: number) => void;
    vi.mocked(login).mockReturnValueOnce(new Promise((resolve) => (finishLogin = resolve)));
    const { wrapper } = await mountWithRouter(LoginForm);
    const [email, password] = wrapper.findAll("input");
    await email.setValue("me@example.com");
    await password.setValue("secret");

    await wrapper.find("form").trigger("submit");

    expect(login).toHaveBeenCalledWith("me@example.com", "secret");
    expect(wrapper.find('button[type="submit"]').text()).toBe("Logging in");

    finishLogin();
    await flushPromises();

    expect(wrapper.find('button[type="submit"]').text()).toBe("Log in");
  });

  it("checks a field once it's left, and keeps the key looking disabled until both are right", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);
    const [email, password] = wrapper.findAll("input");
    const key = wrapper.find('button[type="submit"]');
    expect(key.attributes("aria-disabled")).toBe("true");

    await email.setValue("me");
    await email.trigger("blur");
    await password.setValue("x");
    await password.setValue("");
    await password.trigger("blur");

    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter a valid e-mail address.",
      "Enter your password."
    ]);

    // An address from before today's rules still gets in.
    await email.setValue("old@localhost");
    await password.setValue("secret");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(key.attributes("aria-disabled")).toBeUndefined();
  });

  it("shows what's missing instead of logging in, and flashes the key", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(login).not.toHaveBeenCalled();
    expect(wrapper.findAll(".field__error")).toHaveLength(2);
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(wrapper.find('button[type="submit"]').classes()).toContain("btn--error");

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(wrapper.find('button[type="submit"]').classes()).not.toContain("btn--error");
    vi.useRealTimers();
    wrapper.unmount();
  });

  it("forgets the shown problems after logging out", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.findAll(".field__error")).toHaveLength(2);

    isLoggedIn.value = true;
    await flushPromises();
    isLoggedIn.value = false;
    await flushPromises();

    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("shows nothing before an attempt, or after a successful one", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    loginStatus.value = "success";
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("explains an unknown error", async () => {
    loginStatus.value = "unknown-error";
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "An unknown error occurred. Please try again later."
    );
  });

  it("shows other errors as they came from the API", async () => {
    loginStatus.value = "Wrong password.";
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find('[role="alert"]').text()).toBe("Wrong password.");
  });

  it("replaces the form with a success message when logged in", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.text()).toContain("Login successful!");
    expect(wrapper.find('a[href="/shorten"]').exists()).toBe(true);
  });

  it("offers GitHub login under the form", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find('a[href="https://api.test/auth/github"]').text()).toBe(
      "Log in with GitHub"
    );
  });

  it("links to resetting a forgotten password", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find('a[href="/reset-password"]').text()).toBe("Forgot password?");
  });

  it("shows a password reset's message once", async () => {
    passwordResetNotice.value = "Password reset successfully: log in with the new password.";
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find("form").find('[role="status"]').text()).toBe(
      "Password reset successfully: log in with the new password."
    );
    expect(passwordResetNotice.value).toBe("");

    const { wrapper: again } = await mountWithRouter(LoginForm);
    expect(again.find('[role="status"]').exists()).toBe(false);
  });

  it("shows a reset's message to a user logged in as another account, with a way to log out", async () => {
    isLoggedIn.value = true;
    userEmail.value = "anna@example.com";
    passwordResetNotice.value = "Password reset successfully: log in with the new password.";
    const { wrapper } = await mountWithRouter(LoginForm);

    expect(wrapper.find('[role="status"]').text()).toBe(
      "Password reset successfully: log in with the new password."
    );
    expect(wrapper.text()).not.toContain("Login successful!");
    expect(wrapper.find(".who").text()).toBe("anna@example.com");

    await wrapper.find("button").trigger("click");
    expect(logout).toHaveBeenCalledOnce();

    isLoggedIn.value = false;
    await flushPromises();
    expect(wrapper.find("form").find('[role="status"]').text()).toBe(
      "Password reset successfully: log in with the new password."
    );
  });

  it("drops a reset's message once the user logs in, so the login shows as usual", async () => {
    passwordResetNotice.value = "Password reset successfully: log in with the new password.";
    vi.mocked(login).mockImplementationOnce(async () => {
      isLoggedIn.value = true;
      loginStatus.value = "success";
      return undefined;
    });
    const { wrapper } = await mountWithRouter(LoginForm);
    const [email, password] = wrapper.findAll("input");
    await email.setValue("me@example.com");
    await password.setValue("a new password");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("Login successful!");
    expect(wrapper.text()).not.toContain("Password reset successfully");
    expect(wrapper.find('a[href="/shorten"]').exists()).toBe(true);
  });

  it("explains a failed GitHub login from the URL", async () => {
    const { wrapper, router } = await mountWithRouter(
      LoginForm,
      {},
      "/login?oauthError=emailExists"
    );
    await flushPromises();

    expect(wrapper.find("form").find('[role="alert"]').text()).toContain(
      "An account already uses your GitHub e-mail address."
    );
    expect(router.currentRoute.value.fullPath).toBe("/login");
  });

  it("shows a failed GitHub link to a logged-in user, with the way back to their account", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(
      LoginForm,
      {},
      "/login?oauthError=githubAlreadyLinked"
    );

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "That GitHub account is already linked to another account here."
    );
    expect(wrapper.text()).not.toContain("Login successful!");
    expect(wrapper.find('a[href="/account"]').text()).toBe("Go to your account");
  });

  it("clears the last status after logging out", async () => {
    isLoggedIn.value = true;
    loginStatus.value = "success";
    await mountWithRouter(LoginForm);

    isLoggedIn.value = false;
    await flushPromises();

    expect(loginStatus.value).toBe("");
  });

  describe("over the login limiter", () => {
    const LIMITED = "Too many failed attempts: try again later.";

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      vi.mocked(login).mockImplementationOnce(async () => {
        loginStatus.value = LIMITED;
        return 900;
      });
    });

    afterEach(() => {
      vi.useRealTimers();
      document.body.innerHTML = "";
    });

    const tryLogin = async () => {
      const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });
      const [email, password] = wrapper.findAll("input");
      await email.setValue("me@example.com");
      await password.setValue("nope");
      (wrapper.find('button[type="submit"]').element as HTMLElement).focus();
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      return { wrapper, email, password, key: () => wrapper.find('button[type="submit"]') };
    };

    it("holds the key for the wait with the API's message, then lets the user try again", async () => {
      const { wrapper, password, key } = await tryLogin();

      expect(wrapper.find('[role="alert"]').text()).toBe(LIMITED);
      expect(key().text()).toBe("Try again in 15 min");
      expect(key().attributes("aria-label")).toBe("Try again in 15 minutes");
      expect(key().attributes("disabled")).toBeDefined();
      // The disabled key can't keep the focus.
      expect(document.activeElement).toBe(password.element);

      // Enter in a field can't send it either.
      await wrapper.find("form").trigger("submit");
      expect(login).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(899_000);
      await flushPromises();
      expect(key().text()).toBe("Try again in 1 sec");

      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(key().text()).toBe("Log in");
      expect(key().attributes("disabled")).toBeUndefined();
      expect(key().attributes("aria-label")).toBeUndefined();
    });

    it("only holds the address the limiter counted", async () => {
      const { email, key } = await tryLogin();

      await email.setValue("other@example.com");
      expect(key().text()).toBe("Log in");
      expect(key().attributes("disabled")).toBeUndefined();

      // The same address, however it's typed, waits on.
      await email.setValue(" Me@Example.com ");
      expect(key().text()).toBe("Try again in 15 min");
    });

    it("leaves the focus in the form where it stayed", async () => {
      const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });
      const [email, password] = wrapper.findAll("input");
      await email.setValue("me@example.com");
      await password.setValue("nope");
      (email.element as HTMLElement).focus();

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(document.activeElement).toBe(email.element);
    });
  });

  it("keeps the status when logging in", async () => {
    loginStatus.value = "success";
    await mountWithRouter(LoginForm);

    isLoggedIn.value = true;
    await flushPromises();

    expect(loginStatus.value).toBe("success");
  });
});
