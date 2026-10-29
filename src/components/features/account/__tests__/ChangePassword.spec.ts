import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ChangePassword from "@/components/features/account/ChangePassword.vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const TOO_SHORT = "The password's too short: it must be between 8 and 128 characters.";

describe("ChangePassword", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let wrapper: VueWrapper;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    wrapper = mount(ChangePassword, { attachTo: document.body });
  });

  afterEach(() => wrapper.unmount());

  const key = () => wrapper.find("button.change__key");
  const inputs = () => wrapper.findAll("input");
  const errors = () => wrapper.findAll(".field__error").map((error) => error.text());
  const buttons = () => wrapper.findAll("form button");

  const open = async () => {
    await key().trigger("click");
    await flushPromises();
  };

  const fill = async (current: string, next: string, confirm = next) => {
    await inputs()[0].setValue(current);
    await inputs()[1].setValue(next);
    await inputs()[2].setValue(confirm);
  };

  const submit = async () => {
    await wrapper.find("form").trigger("submit");
    await flushPromises();
  };

  it("opens the form in place of its key and focuses the first field", async () => {
    expect(key().text()).toBe("Change password");
    expect(wrapper.find("form").exists()).toBe(false);

    await open();

    expect(key().exists()).toBe(false);
    expect(wrapper.findAll("label").map((label) => label.text())).toEqual([
      "Current password",
      "New password",
      "Confirm new password"
    ]);
    expect(inputs().map((input) => input.attributes("autocomplete"))).toEqual([
      "current-password",
      "new-password",
      "new-password"
    ]);
    expect(inputs().every((input) => input.attributes("type") === "password")).toBe(true);
    expect(wrapper.find(".field__hint").text()).toBe("8 to 128 characters.");
    expect(document.activeElement).toBe(inputs()[0].element);
  });

  it("asks for the missing fields without calling the API", async () => {
    await open();
    inputs()[0].element.blur();

    await submit();

    expect(errors()).toEqual(["Enter your current password.", TOO_SHORT]);
    expect(document.activeElement).toBe(inputs()[0].element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("counts code points and checks the confirmation", async () => {
    await open();
    await fill("old-password", "🔑🔑🔑🔑", "🔑🔑🔑");

    await submit();

    expect(errors()).toEqual([TOO_SHORT, "The two passwords don't match."]);
    expect(document.activeElement).toBe(inputs()[1].element);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("focuses an unmatched confirmation and clears an error once its field changes", async () => {
    await open();
    await fill("old-password", "new-password", "new-passwort");

    await submit();
    expect(errors()).toEqual(["The two passwords don't match."]);
    expect(document.activeElement).toBe(inputs()[2].element);

    await inputs()[2].setValue("new-password");
    expect(errors()).toEqual([]);
  });

  it("saves the new password, closes the form and shows the API's message", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    await open();
    await fill("old-password", "new-password");

    await wrapper.find("form").trigger("submit");
    expect(buttons().map((button) => button.text())).toEqual(["Saving", "Cancel"]);
    expect(buttons()[1].attributes("disabled")).toBeDefined();
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("form").exists()).toBe(true);

    answer(jsonResponse(200, { message: "Password changed successfully." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/user/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password" })
    });
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toBe("Password changed successfully.");
    expect(document.activeElement).toBe(key().element);

    await open();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(inputs().map((input) => input.element.value)).toEqual(["", "", ""]);
  });

  it("shows the API's refusal above the keys and keeps the values", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    await open();
    await fill("wrong-password", "new-password");

    await submit();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toBe("The provided password is incorrect.");
    expect(alert.element.nextElementSibling!.classList).toContain("change__actions");
    expect(inputs().map((input) => input.element.value)).toEqual([
      "wrong-password",
      "new-password",
      "new-password"
    ]);
    expect(buttons().map((button) => button.text())).toEqual(["Save password", "Cancel"]);
    expect(document.activeElement).toBe(buttons()[0].element);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await open();
    await fill("old-password", "new-password");

    await submit();

    expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it.each([
    [200, { message: "Password changed successfully." }],
    [403, { error: "The provided password is incorrect." }]
  ])("doesn't throw when it's gone before a %i answer arrives", async (status, body) => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    await open();
    await fill("old-password", "new-password");
    await wrapper.find("form").trigger("submit");

    wrapper.unmount();
    answer(jsonResponse(status, body));
    await flushPromises();

    wrapper = mount(ChangePassword);
  });

  it("cancels with Escape or the Cancel key, clearing everything", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    await open();
    await fill("wrong-password", "new-password");
    await submit();

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(key().element);

    await open();
    expect(inputs().map((input) => input.element.value)).toEqual(["", "", ""]);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await buttons()[1].trigger("click");
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
  });
});
