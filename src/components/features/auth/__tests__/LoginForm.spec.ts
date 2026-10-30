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
    let finishLogin!: () => void;
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

  it("keeps the status when logging in", async () => {
    loginStatus.value = "success";
    await mountWithRouter(LoginForm);

    isLoggedIn.value = true;
    await flushPromises();

    expect(loginStatus.value).toBe("success");
  });
});
