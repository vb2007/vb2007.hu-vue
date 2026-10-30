import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import DeleteAccount from "@/components/features/account/DeleteAccount.vue";
import { hasPassword, isLoggedIn, username } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

type Wrapper = Awaited<ReturnType<typeof mountWithRouter>>["wrapper"];

const mountPanel = () => mountWithRouter(DeleteAccount, { attachTo: document.body }, "/account");

const deleteKey = (wrapper: Wrapper) => wrapper.find('button[type="submit"]');

const open = async (wrapper: Wrapper) => {
  await wrapper.find("button").trigger("click");
  await flushPromises();
};

describe("DeleteAccount", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    isLoggedIn.value = true;
    username.value = "me";
    hasPassword.value = true;
  });

  it("says what goes with the account and asks before deleting it", async () => {
    const { wrapper } = await mountPanel();

    expect(wrapper.find("h2").text()).toBe("Delete account");
    expect(wrapper.find(".delete__note").text()).toBe(
      "Deleting your account also deletes your pastes, short links and uploads. It can't be undone."
    );
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find("button").text()).toBe("Delete account");
    wrapper.unmount();
  });

  it("deletes an account with its password and goes home", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper, router } = await mountPanel();
    let loggedInOnArrival: boolean | undefined;
    router.afterEach(() => (loggedInOnArrival = isLoggedIn.value));

    await open(wrapper);
    const input = wrapper.find("input");
    expect(input.attributes("type")).toBe("password");
    expect(input.attributes("autocomplete")).toBe("current-password");
    expect(document.activeElement).toBe(input.element);
    expect(deleteKey(wrapper).attributes("disabled")).toBeDefined();
    expect(deleteKey(wrapper).classes()).not.toContain("btn--error");

    await input.setValue("hunter22");
    expect(deleteKey(wrapper).attributes("disabled")).toBeUndefined();
    expect(deleteKey(wrapper).classes()).toContain("btn--error");

    await wrapper.find("form").trigger("submit");
    expect(deleteKey(wrapper).text()).toBe("Deleting");
    answer(jsonResponse(200, { message: "User deleted successfully." }));
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      password: "hunter22"
    });
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(loggedInOnArrival).toBe(true);
    expect(isLoggedIn.value).toBe(false);
    wrapper.unmount();
  });

  it("stays open on Escape while the delete is on its way", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(true);

    answer(jsonResponse(403, { error: "The provided password is incorrect." }));
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(wrapper.find("input").element.value).toBe("wrong");
    wrapper.unmount();
  });

  it("asks an account made with GitHub to type its username", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    const input = wrapper.find("input");
    expect(wrapper.find("label").text()).toBe("Username");
    expect(wrapper.find(".field__hint").text()).toBe("Type “me” to confirm.");
    expect(input.attributes("autocapitalize")).toBe("off");
    // The field's wrapper takes it, and the input inherits it.
    expect(wrapper.find(".field").attributes("spellcheck")).toBe("false");

    await input.setValue("Me");
    expect(deleteKey(wrapper).attributes("disabled")).toBeDefined();
    await wrapper.find("form").trigger("submit");
    expect(fetchMock).not.toHaveBeenCalled();

    await input.setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ username: "me" });
    wrapper.unmount();
  });

  it("shows why the API refused and keeps the account", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    const { wrapper, router } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(isLoggedIn.value).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe("/account");
    wrapper.unmount();
  });

  it("brings focus back to the field when a refusal finds it outside, so Escape still closes", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    const input = wrapper.find("input");
    await input.setValue("wrong");
    await wrapper.find("form").trigger("submit");
    (input.element as HTMLInputElement).blur();
    expect(document.activeElement).toBe(document.body);
    answer(jsonResponse(403, { error: "The provided password is incorrect." }));
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(document.activeElement).toBe(input.element);

    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
    wrapper.unmount();
  });

  it("puts the key back on Cancel or Escape, forgetting what was typed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: "Too many failed attempts." }));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);

    await open(wrapper);
    expect(wrapper.find("input").element.value).toBe("");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    wrapper.unmount();
  });
});
