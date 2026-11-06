import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import AdminPendingRegistrations from "@/components/features/admin/AdminPendingRegistrations.vue";
import StatusPill from "@/components/ui/StatusPill.vue";
import { SEARCH_DELAY_MS } from "@/composables/usePagedList";
import { Limits } from "@/constants/limits";
import type { AdminPendingRegistration } from "@/types/api/admin";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const NOW = Date.parse("2026-11-06T12:00:00.000Z");

const pending = (id: string, expiresAt = "2026-11-07T10:00:00.000Z"): AdminPendingRegistration => ({
  id,
  email: `${id}@example.com`,
  expiresAt
});

const listing = (
  rows: AdminPendingRegistration[],
  { page = 1, pages = 1, total = rows.length } = {}
) =>
  jsonResponse(200, { pendingRegistrations: rows, pagination: { limit: 20, page, total, pages } });

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

const lastUrl = (fetchMock: ReturnType<typeof mockFetch>) =>
  String(fetchMock.mock.calls.at(-1)![0]);

enableAutoUnmount(afterEach);

describe("AdminPendingRegistrations", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("loads on mount, then lists each address with its expiry", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = mount(AdminPendingRegistrations);
    await flushPromises();

    expect(wrapper.find("h2").text()).toBe("Pending registrations");
    expect(wrapper.find(".note").text()).toBe("Loading the pending registrations…");
    expect(wrapper.find("input").attributes("maxlength")).toBe(`${Limits.Search.maxLength}`);

    respond(listing([pending("anna"), pending("old", "2026-11-06T11:00:00.000Z")]));
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("2 pending registrations");
    const rows = wrapper.findAll(".row");
    expect(rows.map((row) => row.find(".row__email").text())).toEqual([
      "anna@example.com",
      "old@example.com"
    ]);
    expect(rows[0].find(".row__meta").text()).toMatch(/^Expires \S/);
    expect(rows[0].findComponent(StatusPill).exists()).toBe(false);
    expect(rows[1].findComponent(StatusPill).text()).toBe("Expired");
    expect(rows[1].findComponent(StatusPill).props("tone")).toBe("danger");
    expect(rows[1].find("time").attributes("datetime")).toBe("2026-11-06T11:00:00.000Z");
    expect(rows[0].find("button .visually-hidden").text()).toBe("anna@example.com");
    expect(wrapper.find(".pager").exists()).toBe(false);
  });

  it("says when nobody is waiting", async () => {
    fetchMock.mockResolvedValueOnce(listing([]));
    const wrapper = mount(AdminPendingRegistrations);
    await flushPromises();

    expect(wrapper.find(".count").text()).toBe("0 pending registrations");
    expect(wrapper.find(".empty").text()).toBe("No sign-up is waiting for its code.");
  });

  it("searches by e-mail and offers the whole list back when nothing matches", async () => {
    fetchMock.mockResolvedValueOnce(listing([pending("anna")], { pages: 2, total: 21 }));
    const wrapper = mount(AdminPendingRegistrations);
    await flushPromises();
    expect(wrapper.find(".pager").text()).toContain("Page 1 of 2");

    fetchMock.mockResolvedValueOnce(listing([]));
    await wrapper.find("input").setValue("nobody");
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();

    expect(lastUrl(fetchMock)).toBe(
      "https://api.test/admin/pending-registrations?limit=20&page=1&q=nobody"
    );
    expect(wrapper.find(".count").text()).toBe("0 pending registrations found");
    expect(wrapper.find(".empty .note").text()).toBe("No address matches that search.");

    fetchMock.mockResolvedValueOnce(listing([pending("anna")]));
    await buttonNamed(wrapper, "Show all").trigger("click");
    vi.advanceTimersByTime(SEARCH_DELAY_MS);
    await flushPromises();

    expect(lastUrl(fetchMock)).toBe("https://api.test/admin/pending-registrations?limit=20&page=1");
    expect(wrapper.find(".count").text()).toBe("1 pending registration");
  });

  it("removes a row on the second click, and shows the API's refusal", async () => {
    fetchMock.mockResolvedValueOnce(listing([pending("anna"), pending("milo")]));
    const wrapper = mount(AdminPendingRegistrations);
    await flushPromises();

    await buttonNamed(wrapper, "Delete").trigger("click");
    expect(wrapper.findAll(".row")[0].text()).toContain("Confirm delete");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Pending registration removed." }))
      .mockResolvedValueOnce(listing([pending("milo")]));
    await buttonNamed(wrapper, "Confirm delete").trigger("click");
    await flushPromises();

    expect(String(fetchMock.mock.calls[1][0])).toBe(
      "https://api.test/admin/pending-registrations/anna"
    );
    expect(wrapper.findAll(".row__email").map((email) => email.text())).toEqual([
      "milo@example.com"
    ]);

    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }));
    await buttonNamed(wrapper, "Delete").trigger("click");
    await buttonNamed(wrapper, "Confirm delete").trigger("click");
    await flushPromises();

    expect(wrapper.find(".status").text()).toBe("Something went wrong.");
  });

  it("shows a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined));
    const wrapper = mount(AdminPendingRegistrations);
    await flushPromises();

    expect(wrapper.find(".status").text()).toBe("Failed to load the pending registrations: 500");
    expect(wrapper.find(".rows").exists()).toBe(false);
  });
});
