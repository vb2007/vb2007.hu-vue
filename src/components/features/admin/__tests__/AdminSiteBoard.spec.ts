import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import AdminSiteBoard from "@/components/features/admin/AdminSiteBoard.vue";
import MailBudgetMeter from "@/components/features/admin/MailBudgetMeter.vue";
import { aMailBudget, someStats } from "@/__tests__/helpers/admin";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const ledger = (wrapper: ReturnType<typeof mount>, index: number) =>
  wrapper
    .findAll(".ledger")
    [index]!.findAll(".ledger__row")
    .map((row) => `${row.find("dt").text().replace(/\s+/g, " ")} ${row.find("dd").text()}`);

describe("AdminSiteBoard", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("says what's loading until each part answers", async () => {
    // The totals go out first, then today's mail.
    const stats = deferResponse(fetchMock);
    const mail = deferResponse(fetchMock);
    const wrapper = mount(AdminSiteBoard);

    expect(wrapper.find("h2").text()).toBe("Site");
    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual([
      "Totals",
      "Mail today"
    ]);
    expect(wrapper.findAll(".part__note").map((note) => note.text())).toEqual([
      "Loading the site's totals…",
      "Loading today's mail…"
    ]);

    mail.respond(jsonResponse(200, aMailBudget()));
    await flushPromises();
    expect(wrapper.findComponent(MailBudgetMeter).props("budget")).toEqual(aMailBudget());
    expect(wrapper.find(".part__note").text()).toBe("Loading the site's totals…");

    stats.respond(jsonResponse(200, someStats()));
    await flushPromises();
    expect(wrapper.find(".part__note").exists()).toBe(false);
  });

  it("lists the site's totals and upload settings", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, someStats()))
      .mockResolvedValueOnce(jsonResponse(200, aMailBudget()));
    const wrapper = mount(AdminSiteBoard);
    await flushPromises();

    expect(wrapper.findAll("h3").map((heading) => heading.text())).toEqual([
      "Totals",
      "Upload settings",
      "Mail today"
    ]);
    expect(ledger(wrapper, 0)).toEqual([
      "Users 42",
      `Pastes ${(1250).toLocaleString()}`,
      "Short links 35",
      "Uploads 12 public, 68 private 80",
      "Stored All uploads together 500 MB",
      "Sign-ups waiting For their e-mail code 3"
    ]);
    expect(ledger(wrapper, 1)).toEqual([
      "Default quota For users without their own 10 GB",
      "Largest file One upload can take 100 MB"
    ]);
  });

  it("shows each part's failure on its own", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502))
      .mockResolvedValueOnce(jsonResponse(200, aMailBudget()));
    const wrapper = mount(AdminSiteBoard);
    await flushPromises();

    expect(wrapper.find(".status").text()).toMatch(/^Failed to load the site's totals/);
    expect(wrapper.find(".ledger").exists()).toBe(false);
    expect(wrapper.findComponent(MailBudgetMeter).exists()).toBe(true);
  });

  it("keeps the totals when today's mail fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, someStats()))
      .mockRejectedValueOnce(new TypeError("offline"));
    const wrapper = mount(AdminSiteBoard);
    await flushPromises();

    expect(wrapper.findAll(".ledger")).toHaveLength(2);
    expect(wrapper.find(".status").text()).toBe("Error connecting to server");
    expect(wrapper.findComponent(MailBudgetMeter).exists()).toBe(false);
  });
});
