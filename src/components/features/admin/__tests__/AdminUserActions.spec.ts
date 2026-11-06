import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, type VueWrapper } from "@vue/test-utils";
import AdminDeleteUser from "@/components/features/admin/AdminDeleteUser.vue";
import AdminLogoutUser from "@/components/features/admin/AdminLogoutUser.vue";
import AdminRenameUser from "@/components/features/admin/AdminRenameUser.vue";
import { AdminRoutes } from "@/constants/admin";
import { Messages } from "@/constants/messages";
import { isLoggedIn, isSuperuser, userId, username } from "@/scripts/authentication/authState";
import type { AdminUser } from "@/types/api/admin";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

enableAutoUnmount(afterEach);

const NOT_LOGGED_IN = "You must be logged in to perform this action.";

let fetchMock: ReturnType<typeof mockFetch>;

beforeEach(() => {
  fetchMock = mockFetch();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  userId.value = "";
});

/** The method, address and body of the mock's `index`th request. */
const sent = (index = 0) => {
  const [url, init] = fetchMock.mock.calls[index];
  return {
    method: init?.method,
    url: String(url),
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body))
  };
};

describe("AdminRenameUser", () => {
  const anna = anAdminUser("a", { username: "anna" });

  const mountRename = async (user: AdminUser = anna) => {
    const { wrapper } = await mountWithRouter(AdminRenameUser, {
      props: { user },
      attachTo: document.body
    });
    const updated = () => wrapper.emitted("updated") ?? [];
    return { wrapper, updated };
  };

  const field = (wrapper: VueWrapper) => wrapper.find<HTMLInputElement>("input");
  const save = (wrapper: VueWrapper) => wrapper.find<HTMLButtonElement>("button[type=submit]");

  const open = async (wrapper: VueWrapper) => {
    await wrapper.find(".action__keys button").trigger("click");
    await flushPromises();
  };

  it("opens a form in place with the name to change, selected", async () => {
    const { wrapper } = await mountRename();

    expect(wrapper.find("h3").text()).toBe("Rename");
    expect(wrapper.find(".action__note").text()).toBe(
      "Changes the name anna goes by on the site. A name another account uses is taken, whatever its case."
    );
    expect(wrapper.find("form").exists()).toBe(false);

    await open(wrapper);

    expect(wrapper.find(".action__keys").exists()).toBe(false);
    expect(field(wrapper).element.value).toBe("anna");
    expect(document.activeElement).toBe(field(wrapper).element);
    expect(wrapper.find(".field__hint").text()).toBe("2 to 16 characters.");
    // The same name can't be saved, but another case of it can.
    expect(save(wrapper).attributes("disabled")).toBeDefined();
    await field(wrapper).setValue("Anna");
    expect(save(wrapper).attributes("disabled")).toBeUndefined();
  });

  it("checks the length from the API's limits as it's typed", async () => {
    const { wrapper } = await mountRename();
    await open(wrapper);

    await field(wrapper).setValue("a".repeat(17));
    expect(wrapper.find(".field__error").text()).toBe(Messages.Auth.usernameTooLong(2, 16));

    await field(wrapper).setValue(" x ");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(save(wrapper).classes()).toContain("btn--blocked");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".field__error").text()).toBe(Messages.Auth.usernameTooShort(2, 16));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves the trimmed name, applies the answer and says so", async () => {
    const { wrapper, updated } = await mountRename();
    await open(wrapper);

    const renamed = anAdminUser("a", { username: "milo" });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "Username updated successfully.", user: renamed })
    );
    await field(wrapper).setValue("  milo ");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(sent()).toEqual({
      method: "PATCH",
      url: "https://api.test/admin/users/a",
      body: { username: "milo" }
    });
    expect(updated()).toEqual([[renamed]]);
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".status").text()).toBe("Renamed to milo.");
    expect(document.activeElement).toBe(wrapper.find(".action__keys button").element);
    // Someone else's account: the logged-in name stays.
    expect(username.value).toBe("");

    // Opening it again starts afresh.
    await open(wrapper);
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("follows the superuser's own rename in the logged-in name", async () => {
    userId.value = "a";
    username.value = "anna";
    const { wrapper } = await mountRename();
    await open(wrapper);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { user: anAdminUser("a", { username: "Anna" }) })
    );
    await field(wrapper).setValue("Anna");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(username.value).toBe("Anna");
  });

  it.each([
    [409, "This username is already taken."],
    [400, "The username's too long: it must be between 2 and 16 characters."]
  ])("shows the API's %i under the field until it's edited", async (status, error) => {
    const { wrapper, updated } = await mountRename();
    await open(wrapper);

    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    await field(wrapper).setValue("milo");
    save(wrapper).element.focus();
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".field__error").text()).toBe(error);
    expect(document.activeElement).toBe(field(wrapper).element);
    expect(wrapper.find(".status").exists()).toBe(false);
    expect(updated()).toEqual([]);
    // An expected refusal, not a fault.
    expect(console.error).not.toHaveBeenCalled();

    await field(wrapper).setValue("milo2");
    expect(wrapper.find(".field__error").exists()).toBe(false);
  });

  it("shows any other failure in the form, until it's closed", async () => {
    const { wrapper } = await mountRename();
    await open(wrapper);

    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));
    await field(wrapper).setValue("milo");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find("form .status").text()).toBe("Failed to rename the account: Server Error");
    expect(wrapper.find(".field__error").exists()).toBe(false);

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find(".action__keys button").element);

    await open(wrapper);
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("keeps the form open while it saves", async () => {
    const { wrapper } = await mountRename();
    await open(wrapper);

    const answer = deferResponse(fetchMock);
    await field(wrapper).setValue("milo");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(save(wrapper).text()).toBe("Saving");
    const cancel = wrapper.findAll("form button")[1];
    expect(cancel.attributes("disabled")).toBeDefined();
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    expect(wrapper.find("form").exists()).toBe(true);

    answer.respond(jsonResponse(200, { user: anAdminUser("a", { username: "milo" }) }));
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("closes with Cancel", async () => {
    const { wrapper } = await mountRename();
    await open(wrapper);

    await wrapper.findAll("form button")[1].trigger("click");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("AdminLogoutUser", () => {
  const mountLogout = async (user = anAdminUser("a", { username: "anna" })) =>
    (await mountWithRouter(AdminLogoutUser, { props: { user } })).wrapper;

  it("ends the account's sessions and says so", async () => {
    const wrapper = await mountLogout();
    expect(wrapper.find("h3").text()).toBe("Log out everywhere");
    expect(wrapper.find(".action__note").text()).toBe(
      "Ends anna's session on every device. They can log in again."
    );

    const answer = deferResponse(fetchMock);
    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").text()).toBe("Logging out");

    answer.respond(
      jsonResponse(200, {
        message: "User logged out successfully.",
        user: { id: "a", username: "anna" }
      })
    );
    await flushPromises();

    expect(sent()).toEqual({
      method: "POST",
      url: "https://api.test/admin/users/a/logout",
      body: undefined
    });
    expect(wrapper.find("button").text()).toBe("Log out everywhere");
    expect(wrapper.find(".status").text()).toBe(
      "anna is logged out everywhere. They can log in again."
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows a failure", async () => {
    const wrapper = await mountLogout();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that ID." })
    );
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".status--error").text()).toBe("There is no such user with that ID.");
  });

  it("warns on the superuser's own account, then logs the page out", async () => {
    userId.value = "a";
    isLoggedIn.value = true;
    isSuperuser.value = true;
    const wrapper = await mountLogout();

    expect(wrapper.find(".action__note").text()).toBe(
      "This is your account: it ends this session too, so you'll have to log in again."
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { user: { id: "a", username: "anna" } }))
      .mockResolvedValueOnce(jsonResponse(403, { error: NOT_LOGGED_IN }));
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(sent(1)).toMatchObject({ method: "GET", url: "https://api.test/user" });
    expect(isLoggedIn.value).toBe(false);
    expect(isSuperuser.value).toBe(false);
  });
});

describe("AdminDeleteUser", () => {
  const mountDelete = (user = anAdminUser("a", { username: "anna" })) =>
    mountWithRouter(AdminDeleteUser, { props: { user } }, "/admin/users/a");

  it("arms on the first click, and the armed state wears off", async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountDelete();
    expect(wrapper.find("h3").text()).toBe("Delete account");
    expect(wrapper.find(".action__note").text()).toBe(
      "Deletes anna's account with its pastes, short links and uploads. It can't be undone."
    );

    const key = wrapper.find("button");
    expect(key.text()).toBe("Delete account");
    await key.trigger("click");
    expect(key.text()).toBe("Confirm delete");
    expect(key.classes()).toContain("btn--error");

    vi.advanceTimersByTime(4000);
    await flushPromises();
    expect(key.text()).toBe("Delete account");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes on the second click and goes back to the users with the name", async () => {
    const { wrapper, router } = await mountDelete();

    const answer = deferResponse(fetchMock);
    await wrapper.find("button").trigger("click");
    await wrapper.find("button").trigger("click");
    expect(wrapper.find("button").text()).toBe("Deleting");

    answer.respond(jsonResponse(200, { message: "User deleted successfully." }));
    await flushPromises();

    expect(sent()).toEqual({
      method: "DELETE",
      url: "https://api.test/admin/users/a",
      body: undefined
    });
    // The Users page loads on demand.
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe(AdminRoutes.users));
    expect(router.options.history.state).toMatchObject({ deletedUser: "anna" });
  });

  it("stays and shows a failure", async () => {
    const { wrapper, router } = await mountDelete();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that ID." })
    );
    await wrapper.find("button").trigger("click");
    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".status--error").text()).toBe("There is no such user with that ID.");
    expect(wrapper.find("button").text()).toBe("Delete account");
    expect(router.currentRoute.value.name).toBe(AdminRoutes.user);
  });

  it("has no key on the superuser's own account, which can't be deleted", async () => {
    const { wrapper } = await mountDelete(anAdminUser("a", { isSuperuser: true }));

    expect(wrapper.find(".action__note").text()).toBe(
      "The superuser's own account can't be deleted."
    );
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("stops the armed state's timer when it goes", async () => {
    vi.useFakeTimers();
    const { wrapper } = await mountDelete();
    await wrapper.find("button").trigger("click");

    wrapper.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
