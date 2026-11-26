import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SetPasswordForm from "@/components/features/account/SetPasswordForm.vue";
import { hasPassword, userEmail } from "@/scripts/authentication/authState";
import { saveDeleteIntent, takeDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then set the password within 10 minutes.";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?state=xyz";

const fill = async (
  wrapper: ReturnType<typeof mount>,
  password: string,
  confirmPassword = password
) => {
  const [first, second] = wrapper.findAll('input[type="password"]');
  await first.setValue(password);
  await second.setValue(confirmPassword);
};

describe("SetPasswordForm", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "me@example.com";
    sessionStorage.clear();
  });

  it("says why to set one, and that GitHub may confirm it's them first", () => {
    const wrapper = mount(SetPasswordForm);

    expect(wrapper.find(".password__note").text().replace(/\s+/g, " ")).toBe(
      "This account has no password yet: you log in with GitHub. Set one to also log in with your e-mail address, and to be able to unlink GitHub. Unless you logged in with GitHub in the last 10 minutes, GitHub confirms it's you first."
    );
  });

  it("asks for a new password twice, for the account's e-mail", () => {
    const wrapper = mount(SetPasswordForm);

    expect(wrapper.find("h2").text()).toBe("Password");
    expect(wrapper.find('input[autocomplete="username"]').element).toHaveProperty(
      "value",
      "me@example.com"
    );
    expect(wrapper.findAll("label").map((label) => label.text())).toEqual([
      "New password",
      "Confirm password"
    ]);
    expect(wrapper.find(".field__hint").text()).toBe("8 to 128 characters.");
    expect(wrapper.find('button[type="submit"]').text()).toBe("Set password");
  });

  it("sets the password and says so", async () => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, { email: "me@example.com", hasPassword: true }));
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "correct horse");

    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('button[type="submit"]').text()).toBe("Setting password");
    answer(jsonResponse(200, { message: "Password set successfully." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/user/password",
      expect.objectContaining({ body: JSON.stringify({ password: "correct horse" }) })
    );
    expect(hasPassword.value).toBe(true);
    expect(wrapper.emitted("set")).toHaveLength(1);
    expect(wrapper.find("section").exists()).toBe(false);
  });

  it.each([
    ["seven77", "The password's too short: it must be between 8 and 128 characters."],
    ["x".repeat(129), "The password's too long: it must be between 8 and 128 characters."]
  ])("keeps %s to itself and explains the length", async (password, error) => {
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, password);

    await wrapper.find("form").trigger("submit");

    expect(wrapper.find(".field__error").text()).toBe(error);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.emitted("set")).toBeUndefined();
  });

  it("counts characters, not UTF-16 units, like the API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Internal Server Error"));
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "🔑".repeat(128));

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("shows a field's problem once it's left, then follows the typing", async () => {
    const wrapper = mount(SetPasswordForm);
    const [first, second] = wrapper.findAll('input[type="password"]');
    const key = wrapper.find('button[type="submit"]');
    expect(key.attributes("aria-disabled")).toBe("true");

    await first.setValue("short");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    await first.trigger("blur");
    expect(wrapper.find(".field__error").text()).toBe(
      "The password's too short: it must be between 8 and 128 characters."
    );

    await first.setValue("correct horse");
    expect(wrapper.find(".field__error").exists()).toBe(false);

    // A confirmation as long as the password that already differs shows while typing.
    await second.setValue("correct");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    await second.setValue("correct hose!");
    expect(wrapper.find(".field__error").text()).toBe("The two passwords don't match.");
    await second.trigger("blur");

    await second.setValue("correct horse");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(key.attributes("aria-disabled")).toBeUndefined();
  });

  it("wants the same password twice, and checks it again with every change", async () => {
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "correct horse", "correct hose");

    await wrapper.find("form").trigger("submit");
    expect(wrapper.find(".field__error").text()).toBe("The two passwords don't match.");
    expect(fetchMock).not.toHaveBeenCalled();

    await wrapper.findAll('input[type="password"]')[1].setValue("correct");
    expect(wrapper.find(".field__error").text()).toBe("The two passwords don't match.");

    await wrapper.findAll('input[type="password"]')[0].setValue("correct");
    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "The password's too short: it must be between 8 and 128 characters."
    ]);
  });

  it("shows the API's error", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(409, { error: "This account already has a password." }))
      // The 409 looks the account up again, which fails.
      .mockResolvedValueOnce(jsonResponse(500));
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "correct horse");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("This account already has a password.");
    expect(wrapper.find('button[type="submit"]').exists()).toBe(true);
    expect(wrapper.emitted("set")).toBeUndefined();
  });

  it("sends the user to GitHub when the API wants it to confirm them first", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    const wrapper = mount(SetPasswordForm, { attachTo: document.body });
    await fill(wrapper, "correct horse");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toBe(REAUTH);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    const confirm = wrapper.find("button");
    expect(confirm.text()).toBe("Confirm with GitHub");
    expect(document.activeElement).toBe(confirm.element);
    expect(confirm.attributes("aria-describedby")).toBe(
      wrapper.find('[role="status"]').attributes("id")
    );
    expect(confirm.attributes("aria-describedby")).toBeTruthy();
    wrapper.unmount();
  });

  /** Sends a password the API wants GitHub to confirm first. */
  const askForGithub = async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    const wrapper = mount(SetPasswordForm, { attachTo: document.body });
    await fill(wrapper, "correct horse");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    return wrapper;
  };

  it("relinks without a password, forgetting a delete left unconfirmed just before leaving", async () => {
    const wrapper = await askForGithub();
    saveDeleteIntent("me");
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const confirm = wrapper.find("button");

    await confirm.trigger("click");
    expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(confirm.text()).toBe("Opening GitHub");
    expect(confirm.attributes("aria-busy")).toBe("true");
    answer(jsonResponse(200, { url: AUTHORIZE_URL }));
    await flushPromises();

    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
    // Coming back from GitHub is about the password.
    expect(takeDeleteIntent()).toBe("");
    wrapper.unmount();
  });

  it("says why GitHub couldn't open, until the password is sent again", async () => {
    const wrapper = await askForGithub();
    saveDeleteIntent("me");
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "notConfigured" }));

    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(assign).not.toHaveBeenCalled();
    expect(sessionStorage.length).toBe(1);
    expect(wrapper.find('[role="status"]').text()).toBe(REAUTH);
    expect(wrapper.find('[role="alert"]').text()).toBe("GitHub login isn't available right now.");
    expect(document.activeElement).toBe(wrapper.find("button").element);

    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("holds the GitHub key after the API's 429, with the cursor back in the password", async () => {
    const error = "Too many failed attempts. Please try again later.";
    const wrapper = await askForGithub();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));

    await wrapper.find("button").trigger("click");
    await flushPromises();

    const confirm = wrapper.find("button");
    expect(wrapper.find('[role="alert"]').text()).toBe(`${error} Try again in 15 minutes.`);
    expect(confirm.text()).toBe("Try again in 15 min");
    expect(confirm.attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(wrapper.find('input[type="password"]').element);
    wrapper.unmount();
  });
});
