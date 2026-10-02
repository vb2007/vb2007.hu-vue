import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { login, loginStatus, restoreSession } from "@/scripts/authentication/user";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  login: vi.fn(),
  restoreSession: vi.fn()
}));

describe("LoginForm", () => {
  beforeEach(() => {
    vi.mocked(login).mockReset();
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
