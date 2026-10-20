import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { nextTick } from "vue";
import AdminUserList from "@/components/features/admin/AdminUserList.vue";
import AdminUserRow from "@/components/features/admin/AdminUserRow.vue";
import { SEARCH_DELAY_MS } from "@/composables/useAdminUsers";
import type { AdminUser } from "@/scripts/admin/adminUser";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const listing = (users: AdminUser[], { page = 1, pages = 1, total = users.length } = {}) =>
  jsonResponse(200, {
    users,
    pagination: { limit: 20, page, total, pages, sortBy: "usedBytes", sortOrder: "desc" }
  });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

// A list left mounted could still fire a pending search into the next test's fetch mock.
enableAutoUnmount(afterEach);

describe("AdminUserList", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the users on mount and lists them", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = mount(AdminUserList, { props: { as: "h1" } });
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Upload quotas");
    expect(wrapper.find(".note").text()).toBe("Loading the users…");

    respond(listing([anAdminUser("a"), anAdminUser("b")]));
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("2 users");
    expect(wrapper.findAllComponents(AdminUserRow).map((row) => row.props("user").id)).toEqual([
      "a",
      "b"
    ]);
    expect(wrapper.find(".rows").attributes("aria-busy")).toBeUndefined();
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("uses an h2 by default and says when there are no accounts", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const wrapper = mount(AdminUserList);
    await flushPromises();

    expect(wrapper.find("h2").text()).toBe("Upload quotas");
    expect(wrapper.find(".count").text()).toBe("0 users");
    expect(wrapper.find(".empty").text()).toBe("No accounts yet.");
  });

  it("says one user, and offers everyone back when a search finds nobody", async () => {
    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a")]));
    const wrapper = mount(AdminUserList);
    await flushPromises();
    expect(wrapper.find(".count").text()).toBe("1 user");

    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(listing([]));
    await wrapper.find("input").setValue("zzz");
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("q=zzz");
    expect(wrapper.find(".count").text()).toBe("0 users found");
    expect(wrapper.find(".empty .note").text()).toBe("No username matches that search.");

    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a")]));
    await buttonNamed(wrapper, "Show everyone").trigger("click");
    await nextTick();
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(lastUrl(fetchMock)).not.toContain("q=");
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("");
  });

  it("sorts by the chosen option", async () => {
    fetchMock.mockResolvedValue(listing([anAdminUser("a")]));
    const wrapper = mount(AdminUserList);
    await flushPromises();
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("usedBytes:desc");

    await wrapper.find("select").setValue("createdAt:asc");
    await flushPromises();

    expect(lastUrl(fetchMock)).toContain("page=1&sortBy=createdAt&sortOrder=asc");
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("createdAt:asc");
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "You do not have permission to perform this action." })
    );
    const wrapper = mount(AdminUserList);
    await flushPromises();

    expect(wrapper.find(".status").text()).toBe(
      "You do not have permission to perform this action."
    );
    expect(wrapper.find(".rows").exists()).toBe(false);
  });

  it("pages through the users", async () => {
    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a")], { pages: 2, total: 21 }));
    const wrapper = mount(AdminUserList);
    await flushPromises();
    expect(wrapper.find(".pager__label").text()).toBe("Page 1 of 2");
    expect(buttonNamed(wrapper, "Previous").attributes("disabled")).toBeDefined();

    fetchMock.mockResolvedValueOnce(listing([anAdminUser("b")], { page: 2, pages: 2, total: 21 }));
    await buttonNamed(wrapper, "Next").trigger("click");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("page=2");
    expect(wrapper.find(".pager__label").text()).toBe("Page 2 of 2");
    expect(buttonNamed(wrapper, "Next").attributes("disabled")).toBeDefined();

    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a")], { pages: 2, total: 21 }));
    await buttonNamed(wrapper, "Previous").trigger("click");
    await flushPromises();
    expect(lastUrl(fetchMock)).toContain("page=1");
  });

  it("hands each row its saving state, error and the quota setter", async () => {
    fetchMock.mockResolvedValueOnce(listing([anAdminUser("a"), anAdminUser("b")]));
    const wrapper = mount(AdminUserList);
    await flushPromises();

    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid quota." }));
    const saving = wrapper.findAllComponents(AdminUserRow)[1].props("setQuota")("b", -1);
    await nextTick();
    expect(wrapper.findAllComponents(AdminUserRow).map((row) => row.props("saving"))).toEqual([
      false,
      true
    ]);
    await saving;
    await nextTick();

    expect(wrapper.findAllComponents(AdminUserRow).map((row) => row.props("error"))).toEqual([
      "",
      "Invalid quota."
    ]);
  });
});
