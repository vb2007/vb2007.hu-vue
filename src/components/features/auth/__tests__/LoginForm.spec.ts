import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import { Messages } from "@/constants/messages";
import { isLoggedIn, userEmail } from "@/scripts/authentication/authState";
import { passwordResetNotice } from "@/scripts/authentication/passwordReset";
import { login, loginStatus, logout, restoreSession } from "@/scripts/authentication/user";
import { descriptionOf } from "@/__tests__/helpers/description";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  login: vi.fn(),
  logout: vi.fn(),
  restoreSession: vi.fn()
}));

/** The API's answer to a wrong password, an unknown address or a GitHub-only account. */
const REFUSED =
  "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub.";

/** Like Chromium, which takes the focus off the key while it's disabled for loading; jsdom keeps it. */
const dropKeyFocus = () => {
  if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
};

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
    const { wrapper } = await mountWithRouter(LoginForm);
    loginStatus.value = "unknown-error";
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "An unknown error occurred. Please try again later."
    );
  });

  it("shows other errors as they came from the API", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);
    loginStatus.value =
      "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub.";
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
    );
  });

  it("shows a lockout above the GitHub login it points to", async () => {
    const { wrapper } = await mountWithRouter(LoginForm);
    loginStatus.value = Messages.Auth.loginLockedOut;
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toBe(
      "Too many failed attempts. Try again later, or log in with GitHub below if it's linked to your account."
    );
    const github = wrapper.find('a[href="https://api.test/auth/github"]').element;
    expect(alert.element.compareDocumentPosition(github)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
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
    await mountWithRouter(LoginForm);
    loginStatus.value = "success";

    isLoggedIn.value = false;
    await flushPromises();

    expect(loginStatus.value).toBe("");
  });

  describe("over the login limiter", () => {
    /** What `login` shows for the lockout, which names no wait: the key counts it down. */
    const LIMITED = Messages.Auth.loginLockedOut;
    let wait: number;

    beforeEach(() => {
      wait = 900;
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
      vi.mocked(login).mockImplementationOnce(async () => {
        dropKeyFocus();
        loginStatus.value = LIMITED;
        return wait;
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

      // The only wait on show is the key's; the message reads it out in words for screen readers.
      const alert = wrapper.find('[role="alert"]');
      expect(alert.text()).toBe(`${LIMITED} Try again in 15 minutes.`);
      expect(alert.find(".visually-hidden").text()).toBe("Try again in 15 minutes.");
      expect(key().text()).toBe("Try again in 15 min");
      expect(key().attributes("aria-label")).toBe("Try again in 15 minutes");
      expect(key().attributes("disabled")).toBeDefined();
      // Described by the shown text only, so its counting name is the one wait it states.
      expect(descriptionOf(key())).toBe(LIMITED);
      // The disabled key can't keep the focus.
      expect(document.activeElement).toBe(password.element);

      // Enter in a field can't send it either.
      await wrapper.find("form").trigger("submit");
      expect(login).toHaveBeenCalledOnce();

      vi.advanceTimersByTime(899_000);
      await flushPromises();
      expect(key().text()).toBe("Try again in 1 sec");
      // The spoken wait stays as it was when the hold started, like the other held forms'.
      expect(wrapper.find('[role="alert"]').text()).toBe(`${LIMITED} Try again in 15 minutes.`);

      vi.advanceTimersByTime(1000);
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(key().text()).toBe("Log in");
      expect(key().attributes("disabled")).toBeUndefined();
      expect(key().attributes("aria-label")).toBeUndefined();
    });

    it("only holds the address the limiter counted", async () => {
      const { wrapper, email, key } = await tryLogin();
      const alert = () => wrapper.find('[role="alert"]');

      // The lockout is the held address's, so another shows none of it.
      await email.setValue("other@example.com");
      expect(key().text()).toBe("Log in");
      expect(key().attributes("disabled")).toBeUndefined();
      expect(key().attributes("aria-describedby")).toBeUndefined();
      expect(alert().exists()).toBe(false);

      // The same address, however it's typed, waits on.
      await email.setValue(" Me@Example.com ");
      expect(key().text()).toBe("Try again in 15 min");
      expect(alert().text()).toBe(`${LIMITED} Try again in 15 minutes.`);
    });

    it("holds nothing when the API sent no wait, and reads none out", async () => {
      wait = 0;
      const { wrapper, key } = await tryLogin();

      expect(wrapper.find('[role="alert"]').text()).toBe(LIMITED);
      expect(wrapper.find(".visually-hidden").exists()).toBe(false);
      expect(key().text()).toBe("Log in");
      expect(key().attributes("disabled")).toBeUndefined();
      // Nothing waits, so the focus goes back to the key it was on.
      expect(document.activeElement).toBe(key().element);
    });

    it("describes a held address by its own lockout, not another address's refusal since", async () => {
      const { wrapper, email, key } = await tryLogin();
      const alert = () => wrapper.find('[role="alert"]');
      vi.mocked(login).mockImplementationOnce(async () => {
        dropKeyFocus();
        loginStatus.value = REFUSED;
        return undefined;
      });
      await email.setValue("other@example.com");
      (key().element as HTMLElement).focus();
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(alert().text()).toBe(REFUSED);
      expect(document.activeElement).toBe(key().element);

      await email.setValue("me@example.com");
      expect(key().attributes("disabled")).toBeDefined();
      expect(alert().text()).toBe(`${LIMITED} Try again in 15 minutes.`);
      expect(alert().find(".visually-hidden").text()).toBe("Try again in 15 minutes.");
      // The held key is described by its own lockout, not the other address's refusal.
      expect(descriptionOf(key())).toBe(LIMITED);

      // The other address's refusal is still the last word about it, and only about it.
      await email.setValue("other@example.com");
      expect(alert().text()).toBe(REFUSED);
      await email.setValue("third@example.com");
      expect(alert().exists()).toBe(false);

      // The end of the hold doesn't bring the other address's refusal over the held one's key.
      await email.setValue("me@example.com");
      vi.advanceTimersByTime(900_000);
      await flushPromises();
      expect(key().text()).toBe("Log in");
      expect(alert().exists()).toBe(false);
    });

    it("holds the address that was sent, even when the field changed before the answer", async () => {
      const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });
      const [email, password] = wrapper.findAll("input");
      let answer!: (wait?: number) => void;
      vi.mocked(login).mockReset();
      vi.mocked(login).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      await email.setValue("me@example.com");
      await password.setValue("nope");
      await wrapper.find("form").trigger("submit");

      await email.setValue("other@example.com");
      loginStatus.value = LIMITED;
      answer(900);
      await flushPromises();

      const key = () => wrapper.find('button[type="submit"]');
      expect(key().text()).toBe("Log in");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await email.setValue("me@example.com");
      expect(key().text()).toBe("Try again in 15 min");
      expect(wrapper.find('[role="alert"]').text()).toBe(`${LIMITED} Try again in 15 minutes.`);
      expect(descriptionOf(key())).toBe(LIMITED);
    });

    it("starts no countdown for an answer that lands after the form is gone", async () => {
      const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });
      const [email, password] = wrapper.findAll("input");
      let answer!: (wait?: number) => void;
      vi.mocked(login).mockReset();
      vi.mocked(login).mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
      await email.setValue("me@example.com");
      await password.setValue("nope");
      await wrapper.find("form").trigger("submit");

      wrapper.unmount();
      answer(900);
      await flushPromises();

      expect(vi.getTimerCount()).toBe(0);
    });

    it("keeps a held address's reason after another account logs in and out", async () => {
      const { wrapper, email, password, key } = await tryLogin();
      vi.mocked(login).mockImplementationOnce(async () => {
        isLoggedIn.value = true;
        loginStatus.value = "success";
        return undefined;
      });
      await email.setValue("other@example.com");
      await password.setValue("secret");
      await wrapper.find("form").trigger("submit");
      await flushPromises();
      expect(wrapper.text()).toContain("Login successful!");

      isLoggedIn.value = false;
      await flushPromises();
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await wrapper.find("input").setValue("me@example.com");

      expect(key().attributes("disabled")).toBeDefined();
      expect(wrapper.find('[role="alert"]').text()).toBe(`${LIMITED} Try again in 15 minutes.`);
      expect(descriptionOf(key())).toBe(LIMITED);
    });

    it("drops a lockout with its hold once the form is left, so a new visit shows neither", async () => {
      const { wrapper } = await tryLogin();
      wrapper.unmount();

      const { wrapper: again } = await mountWithRouter(LoginForm);
      await again.find("input").setValue("me@example.com");

      expect(again.find('[role="alert"]').exists()).toBe(false);
      expect(again.find('button[type="submit"]').text()).toBe("Log in");
      expect(loginStatus.value).toBe("");
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

    it("leaves the focus in the field it stayed in after a refusal that holds nothing", async () => {
      vi.mocked(login).mockReset();
      vi.mocked(login).mockImplementationOnce(async () => {
        dropKeyFocus();
        loginStatus.value = REFUSED;
        return undefined;
      });
      const { wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body });
      const [email, password] = wrapper.findAll("input");
      await email.setValue("me@example.com");
      await password.setValue("nope");
      (password.element as HTMLElement).focus();

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(REFUSED);
      expect(document.activeElement).toBe(password.element);
    });
  });

  it("keeps the status when logging in", async () => {
    await mountWithRouter(LoginForm);
    loginStatus.value = "success";

    isLoggedIn.value = true;
    await flushPromises();

    expect(loginStatus.value).toBe("success");
  });
});
