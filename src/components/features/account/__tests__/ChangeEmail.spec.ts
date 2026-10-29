import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ChangeEmail from "@/components/features/account/ChangeEmail.vue";
import { userEmail } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

describe("ChangeEmail", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let wrapper: VueWrapper;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    userEmail.value = "old@example.com";
    wrapper = mount(ChangeEmail, { attachTo: document.body });
  });

  afterEach(() => wrapper.unmount());

  const key = () => wrapper.find("button");
  const inputs = () => wrapper.findAll("input");
  const button = (name: string) =>
    wrapper.findAll("button").find((found) => found.text() === name)!;

  const openForm = async () => {
    await key().trigger("click");
    await flushPromises();
  };

  const fill = async (email: string, password: string) => {
    await inputs()[0].setValue(email);
    await inputs()[1].setValue(password);
  };

  it("hides the form behind a key", () => {
    expect(key().text()).toBe("Change e-mail");
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("opens the form in place and focuses the new address", async () => {
    await openForm();

    expect(wrapper.find("form").attributes("novalidate")).toBeDefined();
    expect(wrapper.findAll("label").map((label) => label.text())).toEqual([
      "New e-mail",
      "Current password"
    ]);
    expect(inputs().map((input) => input.attributes("type"))).toEqual(["email", "password"]);
    expect(inputs().map((input) => input.attributes("autocomplete"))).toEqual([
      "email",
      "current-password"
    ]);
    expect(inputs().every((input) => input.attributes("required") !== undefined)).toBe(true);
    expect(document.activeElement).toBe(inputs()[0].element);
    expect(button("Change e-mail")).toBeUndefined();
    expect(button("Save e-mail").attributes("type")).toBe("submit");
  });

  it.each([
    ["not-an-address", "secret-password", 0, "Enter a valid e-mail address."],
    ["new@example.com", "", 1, "Enter your current password."]
  ])("checks %j / %j before sending", async (email, password, invalid, error) => {
    await openForm();
    await fill(email, password);

    await wrapper.find("form").trigger("submit");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find(".field__error").text()).toBe(error);
    expect(inputs()[invalid].attributes("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(inputs()[invalid].element);
  });

  it("flags both fields and focuses the first one", async () => {
    await openForm();

    await wrapper.find("form").trigger("submit");

    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter a valid e-mail address.",
      "Enter your current password."
    ]);
    expect(document.activeElement).toBe(inputs()[0].element);
  });

  it("clears a field's error as soon as it's typed in", async () => {
    await openForm();
    await wrapper.find("form").trigger("submit");

    await inputs()[0].setValue("n");
    expect(wrapper.findAll(".field__error").map((error) => error.text())).toEqual([
      "Enter your current password."
    ]);

    await inputs()[1].setValue("s");
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("saves, closes the form and confirms with the API's message", async () => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(jsonResponse(200, { email: "new@example.com" }));
    await openForm();
    await fill("new@example.com", "secret-password");

    await wrapper.find("form").trigger("submit");
    expect(button("Saving").attributes("aria-busy")).toBe("true");
    expect(button("Cancel").attributes("disabled")).toBeDefined();
    answer(jsonResponse(200, { message: "E-mail address updated successfully." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/email", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", password: "secret-password" }),
      credentials: "include"
    });
    expect(userEmail.value).toBe("new@example.com");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toBe("E-mail address updated successfully.");
    expect(document.activeElement).toBe(key().element);

    await openForm();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual(["", ""]);
  });

  it("shows the API's refusal and keeps what was typed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    await openForm();
    await fill("new@example.com", "wrong-password");
    (inputs()[1].element as HTMLInputElement).focus();

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual([
      "new@example.com",
      "wrong-password"
    ]);
    expect(document.activeElement).toBe(inputs()[1].element);
    expect(userEmail.value).toBe("old@example.com");
  });

  it("brings focus back into the form after a clicked save fails, so Escape still works", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    await openForm();
    await fill("taken@example.com", "secret-password");

    await button("Save e-mail").trigger("click");
    await wrapper.find("form").trigger("submit");
    // A disabled button loses focus in the browser, which jsdom doesn't do by itself.
    (document.activeElement as HTMLElement).blur();
    answer(jsonResponse(409, { error: "An account with this E-mail address already exists." }));
    await flushPromises();

    expect(document.activeElement).toBe(inputs()[0].element);
    await inputs()[0].trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(key().element);
  });

  it.each([
    ["saved", jsonResponse(200, { message: "E-mail address updated successfully." })],
    ["refused", jsonResponse(409, { error: "Taken." })]
  ])("doesn't trip over focus when it's gone before the save is %s", async (_how, response) => {
    let answer!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)))
      .mockResolvedValueOnce(jsonResponse(500));
    await openForm();
    await fill("new@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");

    wrapper.unmount();
    answer(response);
    await flushPromises();

    expect(document.activeElement).toBe(document.body);
    wrapper = mount(ChangeEmail);
  });

  it("says so when the server can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await openForm();
    await fill("new@example.com", "secret-password");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
    expect(wrapper.find("form").exists()).toBe(true);
  });

  it.each([
    ["the Cancel key", () => button("Cancel").trigger("click")],
    ["Escape", () => wrapper.find("form").trigger("keydown", { key: "Escape" })]
  ])("%s clears the form and focuses the key", async (_how, cancel) => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: "Taken." }));
    await openForm();
    await fill("taken@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    await cancel();
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(key().element);
    await openForm();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(inputs().map((input) => (input.element as HTMLInputElement).value)).toEqual(["", ""]);
  });

  it("ignores Escape while saving", async () => {
    fetchMock.mockReturnValueOnce(new Promise<Response>(() => {}));
    await openForm();
    await fill("new@example.com", "secret-password");
    await wrapper.find("form").trigger("submit");

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(true);
  });
});
