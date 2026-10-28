import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import SetPasswordForm from "@/components/features/account/SetPasswordForm.vue";
import { hasPassword, userEmail } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then set the password within 10 minutes.";

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

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "me@example.com";
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
    ["seven77", "Too short: use at least 8 characters."],
    ["x".repeat(129), "Too long: use at most 128 characters."]
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

  it("wants the same password twice, and stops complaining once it is", async () => {
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "correct horse", "correct hose");

    await wrapper.find("form").trigger("submit");
    expect(wrapper.find(".field__error").text()).toBe("The two passwords don't match.");
    expect(fetchMock).not.toHaveBeenCalled();

    await wrapper.findAll('input[type="password"]')[1].setValue("correct horse");
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: "This account already has a password." })
    );
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
    const wrapper = mount(SetPasswordForm);
    await fill(wrapper, "correct horse");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(REAUTH);
    expect(wrapper.find('button[type="submit"]').exists()).toBe(false);
    const confirm = wrapper.find('a[href="https://api.test/auth/github/link"]');
    expect(confirm.text()).toBe("Confirm with GitHub");
  });
});
