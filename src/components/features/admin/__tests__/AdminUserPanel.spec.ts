import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { RouterLink } from "vue-router";
import AdminUserPanel from "@/components/features/admin/AdminUserPanel.vue";
import AdminUserAction from "@/components/features/admin/AdminUserAction.vue";
import AdminQuotaEditor from "@/components/features/admin/AdminQuotaEditor.vue";
import { Messages } from "@/constants/messages";
import { QUOTA_UNITS } from "@/scripts/admin/adminUser";
import type { AdminUserDetails } from "@/types/api/admin";
import { anAdminUser, anAdminUserDetails } from "@/__tests__/helpers/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { createTestRouter } from "@/__tests__/helpers/mount";

const { GB } = QUOTA_UNITS;

enableAutoUnmount(afterEach);

const facts = (wrapper: VueWrapper) =>
  Object.fromEntries(
    wrapper
      .findAll(".fact")
      .map((fact) => [fact.find("dt").text(), fact.find("dd").text().replace(/\s+/g, " ")])
  );

describe("AdminUserPanel", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const mountPanel = async (user: AdminUserDetails | Response, id = "a") => {
    fetchMock.mockResolvedValueOnce(
      "status" in user && typeof user.status === "number"
        ? (user as Response)
        : jsonResponse(200, { user })
    );
    const wrapper = mount(AdminUserPanel, {
      props: { id },
      global: { plugins: [createTestRouter()] }
    });
    return wrapper;
  };

  it("says it's loading, then titles the board with the username", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a"));

    expect(wrapper.find("h1").text()).toBe("Account");
    expect(wrapper.find(".note").text()).toBe("Loading the account…");

    await flushPromises();
    expect(wrapper.find("h1").text()).toBe("user-a");
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://api.test/admin/users/a");
  });

  it("lists who the account is, how it logs in and what it owns", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a"));
    await flushPromises();

    expect(wrapper.find(".summary time").attributes("datetime")).toBe("2026-01-10T12:00:00.000Z");
    expect(wrapper.find(".summary").text()).toMatch(/^Joined /);
    expect(wrapper.find(".tag").exists()).toBe(false);
    expect(facts(wrapper)).toEqual({
      Username: "user-a",
      "E-mail": "a@example.com Confirmed",
      Password: "Set",
      GitHub: "Not linked",
      Owns: "3 pastes · 1 short link · 12 uploads",
      ID: "a"
    });
  });

  it("names a pending address, GitHub and a GitHub-only account", async () => {
    const wrapper = await mountPanel(
      anAdminUserDetails("a", {
        hasPassword: false,
        githubLogin: "octo-cat",
        pendingEmail: "new@example.com",
        counts: { pastes: 1, shortUrls: 2, uploads: 1 }
      })
    );
    await flushPromises();

    expect(facts(wrapper)).toMatchObject({
      // The badge waits out the change, so it can't be read as being about the new address.
      "E-mail": "a@example.com",
      "Changing to": "new@example.com (waiting for its code)",
      Password: "None: logs in with GitHub only",
      GitHub: "@octo-cat",
      Owns: "1 paste · 2 short links · 1 upload"
    });
  });

  it("marks an unconfirmed address and an account with no way to log in", async () => {
    const wrapper = await mountPanel(
      anAdminUserDetails("a", { emailVerified: false, hasPassword: false })
    );
    await flushPromises();

    expect(facts(wrapper)).toMatchObject({
      "E-mail": "a@example.com (not confirmed)",
      Password: "None"
    });
  });

  it("tags and dates a suspension, and tags the admin and a custom quota", async () => {
    const wrapper = await mountPanel(
      anAdminUserDetails("a", {
        isSuperuser: true,
        suspendedAt: "2026-11-05T09:00:00.000Z",
        uploads: { hasCustomQuota: true }
      })
    );
    await flushPromises();

    expect(wrapper.findAll(".tag").map((tag) => tag.text())).toEqual([
      "Admin",
      "Suspended",
      "Custom quota"
    ]);
    expect(facts(wrapper).Suspended).toMatch(/^Since .+: they can't log in\.$/);
    expect(wrapper.find(".fact--suspended time").attributes("datetime")).toBe(
      "2026-11-05T09:00:00.000Z"
    );
    expect(wrapper.find(".storage__usage").text()).toContain("on a custom quota.");
  });

  it("measures the storage and edits the quota in place", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a"));
    await flushPromises();

    expect(wrapper.find(".measure__figure").text()).toBe("2 GB of 10 GB");
    expect(wrapper.find(".storage__usage .note").text()).toBe(
      `${(2 * GB).toLocaleString()} bytes used, on the default quota.`
    );
    expect(wrapper.find(".over").exists()).toBe(false);

    const updated = anAdminUser("a", { uploads: { quotaBytes: 20 * GB, hasCustomQuota: true } });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: updated }));
    await wrapper.find("input").setValue("20");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".measure__figure").text()).toBe("2 GB of 20 GB");
    expect(wrapper.find(".status").text()).toBe("Quota set to 20 GB.");
    // The details stay: the quota's answer doesn't carry them.
    expect(facts(wrapper).Owns).toBe("3 pastes · 1 short link · 12 uploads");
  });

  it("shows how far over the quota it is, and a failed save", async () => {
    const wrapper = await mountPanel(
      anAdminUserDetails("a", { uploads: { usedBytes: 12 * GB, quotaBytes: 10 * GB } })
    );
    await flushPromises();

    expect(wrapper.find(".over").text()).toBe("Over by 2 GB.");

    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Database down." }));
    await wrapper.find("input").setValue("11");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".storage__editor .status").text()).toBe("Database down.");
    expect(wrapper.findComponent(AdminQuotaEditor).props("saving")).toBe(false);
  });

  it("leads to the account's uploads from its Actions", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a"));
    await flushPromises();

    const actions = wrapper.findAllComponents(AdminUserAction);
    expect(actions.map((action) => action.props("title"))).toEqual(["Uploads", "Suspend account"]);
    expect(actions[0].find(".action__note").text()).toBe(
      "Open, rename, make private or delete user-a's 12 uploads."
    );
    expect(actions[0].find('a[href="/admin/users/a/uploads"]').text()).toBe("Browse uploads");
    // The name goes along, so the uploads page can say whose they are before they load.
    expect(actions[0].findComponent(RouterLink).props("to")).toEqual({
      name: "admin-user-uploads",
      params: { id: "a" },
      state: { uploadsOwner: "user-a" }
    });
  });

  it("tags and dates the account once it's suspended, keeping the details", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a", { githubLogin: "octo" }));
    await flushPromises();
    expect(wrapper.find(".tag").exists()).toBe(false);

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "User suspended successfully: their session was ended.",
        user: anAdminUser("a", { suspendedAt: "2026-11-06T10:00:00.000Z" })
      })
    );
    await wrapper.find(".actions button").trigger("click");
    await wrapper.find(".confirm").trigger("submit");
    await flushPromises();

    expect(wrapper.findAll(".tag").map((tag) => tag.text())).toEqual(["Suspended"]);
    expect(facts(wrapper).Suspended).toMatch(/^Since .+: they can't log in\.$/);
    expect(facts(wrapper).GitHub).toBe("@octo");
    expect(wrapper.find(".actions .status--success").text()).toBe(
      "User suspended successfully: their session was ended."
    );
  });

  it("says when the account has no uploads", async () => {
    const wrapper = await mountPanel(
      anAdminUserDetails("a", { uploads: { count: 0, usedBytes: 0 } })
    );
    await flushPromises();

    expect(wrapper.find(".action__note").text()).toBe("user-a has no uploads.");
  });

  it.each([
    [400, "Invalid ID format: must be a 24 character HEX string.", Messages.Admin.userInvalidId],
    [404, "There is no such user with that ID.", Messages.Admin.userNotFound]
  ])("shows a %i as a link that leads to no account", async (status, error, message) => {
    const wrapper = await mountPanel(jsonResponse(status, { error }), "nope");
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Account");
    expect(wrapper.find(".status").text()).toBe(message);
    expect(wrapper.find(".facts").exists()).toBe(false);
  });

  it("loads the next account when the ID changes", async () => {
    const wrapper = await mountPanel(anAdminUserDetails("a"));
    await flushPromises();

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user: anAdminUserDetails("b") }));
    await wrapper.setProps({ id: "b" });
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("user-b");
  });
});

describe("AdminUserAction", () => {
  it("leaves out the key line when there's no key", () => {
    const wrapper = mount(AdminUserAction, {
      props: { title: "Log out", icon: "lock" },
      slots: { default: "Ends every session." }
    });

    expect(wrapper.find("h3").text()).toBe("Log out");
    expect(wrapper.find(".action__note").text()).toBe("Ends every session.");
    expect(wrapper.find(".action__keys").exists()).toBe(false);
  });

  it("puts its key under the note, and a panel under the key", () => {
    const wrapper = mount(AdminUserAction, {
      props: { title: "Rename", icon: "pencil" },
      slots: { default: "Note", key: "<button>Rename</button>", panel: "<form>Form</form>" }
    });

    expect(wrapper.find(".action__keys button").text()).toBe("Rename");
    expect(wrapper.find(".action__keys + form").text()).toBe("Form");
  });
});
