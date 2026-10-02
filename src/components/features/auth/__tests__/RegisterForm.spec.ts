import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import RegisterForm from "@/components/features/auth/RegisterForm.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { register, registerStatus } from "@/scripts/authentication/register";
import { restoreSession } from "@/scripts/authentication/user";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/register", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/register")>()),
  register: vi.fn()
}));
vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn(() => Promise.resolve())
}));

const mountForm = async () => {
  const mounted = await mountWithRouter(RegisterForm);
  await flushPromises();
  return mounted.wrapper;
};

const fill = async (
  wrapper: Awaited<ReturnType<typeof mountForm>>,
  {
    email = "me@example.com",
    username = "vb",
    password = "secret",
    confirm = password
  }: { email?: string; username?: string; password?: string; confirm?: string } = {}
) => {
  const [emailInput, usernameInput, passwordInput, confirmInput] = wrapper.findAll(
    'input:not([type="checkbox"])'
  );
  await emailInput.setValue(email);
  await usernameInput.setValue(username);
  await passwordInput.setValue(password);
  await confirmInput.setValue(confirm);
};

const submitButton = (wrapper: Awaited<ReturnType<typeof mountForm>>) =>
  wrapper.find('button[type="submit"]');

describe("RegisterForm", () => {
  beforeEach(() => {
    vi.mocked(register).mockReset();
  });

  afterEach(() => {
    registerStatus.value = "";
  });

  it("clears an old status and checks the session on mount", async () => {
    registerStatus.value = "invalid-email";

    const wrapper = await mountForm();

    expect(restoreSession).toHaveBeenCalled();
    expect(registerStatus.value).toBe("");
    expect(wrapper.find("form").exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows the success view when already logged in", async () => {
    isLoggedIn.value = true;

    const wrapper = await mountForm();

    expect(registerStatus.value).toBe("success");
    expect(wrapper.text()).toContain("Registration successful!");
    expect(wrapper.find('a[href="/shorten"]').exists()).toBe(true);
  });

  it.each([
    [{ email: "nope" }, "Please enter a valid email address."],
    [{ username: "v" }, "Your username's length must be between 2 and 16 characters."],
    [{ password: "123" }, "Your password's length must be between 6 and 30 characters."],
    [{ confirm: "different" }, "The two passwords don't match."]
  ])("rejects invalid input %o before calling the API", async (input, message) => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const wrapper = await mountForm();
    await fill(wrapper, input);

    await wrapper.find("form").trigger("submit");

    expect(register).not.toHaveBeenCalled();
    expect(wrapper.find('[role="alert"]').text()).toBe(message);
    expect(submitButton(wrapper).classes()).toContain("btn--error");

    vi.advanceTimersByTime(1000);
    await flushPromises();
    expect(submitButton(wrapper).classes()).not.toContain("btn--error");
  });

  it("registers with auto-login by default and shows progress meanwhile", async () => {
    let finish!: (created: boolean) => void;
    vi.mocked(register).mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    const wrapper = await mountForm();
    await fill(wrapper);

    await wrapper.find("form").trigger("submit");

    expect(register).toHaveBeenCalledWith("vb", "me@example.com", "secret", true);
    expect(submitButton(wrapper).text()).toBe("Registering");

    registerStatus.value = "success";
    finish(true);
    await flushPromises();

    expect(wrapper.text()).toContain("Registration successful!");
  });

  it("passes the auto-login choice through", async () => {
    vi.mocked(register).mockResolvedValueOnce(true);
    const wrapper = await mountForm();
    await fill(wrapper);
    await wrapper.find('input[type="checkbox"]').setValue(false);

    await wrapper.find("form").trigger("submit");

    expect(register).toHaveBeenCalledWith("vb", "me@example.com", "secret", false);
  });

  it("shows the API's message when registering fails", async () => {
    vi.mocked(register).mockImplementationOnce(async () => {
      registerStatus.value = "Email already taken.";
      return false;
    });
    const wrapper = await mountForm();
    await fill(wrapper);

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Email already taken.");
    expect(submitButton(wrapper).classes()).toContain("btn--error");
    expect(submitButton(wrapper).text()).toBe("Register");
  });

  it("maps the generic error to a readable message", async () => {
    const wrapper = await mountForm();

    registerStatus.value = "error";
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Registration failed. Please try again.");
  });

  it("clears the status after logging out, but not after logging in", async () => {
    await mountForm();
    registerStatus.value = "error";

    isLoggedIn.value = true;
    await flushPromises();
    expect(registerStatus.value).toBe("error");

    isLoggedIn.value = false;
    await flushPromises();
    expect(registerStatus.value).toBe("");
  });
});
