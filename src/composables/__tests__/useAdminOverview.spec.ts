import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminOverview } from "@/composables/useAdminOverview";
import { aMailBudget, someStats } from "@/__tests__/helpers/admin";
import { flushPromises } from "@vue/test-utils";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";

/** Answers each of the overview's two requests by its path, whichever goes out first. */
const answer = (
  fetchMock: ReturnType<typeof mockFetch>,
  answers: { stats: () => Promise<Response>; mailBudget: () => Promise<Response> }
) =>
  fetchMock.mockImplementation((url) =>
    String(url).endsWith("/admin/stats") ? answers.stats() : answers.mailBudget()
  );

describe("useAdminOverview", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the site's totals and today's mail together", async () => {
    answer(fetchMock, {
      stats: async () => jsonResponse(200, someStats()),
      mailBudget: async () => jsonResponse(200, aMailBudget())
    });
    const { stats, mailBudget, statsError, mailBudgetError, isLoading, load } = useAdminOverview();
    const loading = load();
    expect(isLoading.value).toBe(true);
    await loading;
    expect(isLoading.value).toBe(false);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/admin/stats", {
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/admin/mail-budget", {
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(stats.value).toEqual(someStats());
    expect(mailBudget.value).toEqual(aMailBudget());
    expect(statsError.value).toBe("");
    expect(mailBudgetError.value).toBe("");
  });

  it("keeps today's mail when the totals fail", async () => {
    answer(fetchMock, {
      stats: async () => jsonResponse(502),
      mailBudget: async () => jsonResponse(200, aMailBudget())
    });
    const { stats, mailBudget, statsError, mailBudgetError, load } = useAdminOverview();
    await load();

    expect(stats.value).toBeNull();
    expect(statsError.value).toMatch(/^Failed to load the site's totals/);
    expect(mailBudget.value).toEqual(aMailBudget());
    expect(mailBudgetError.value).toBe("");
  });

  it("keeps the totals when today's mail fails", async () => {
    answer(fetchMock, {
      stats: async () => jsonResponse(200, someStats()),
      mailBudget: () => Promise.reject(new TypeError("offline"))
    });
    const { stats, mailBudget, statsError, mailBudgetError, load } = useAdminOverview();
    await load();

    expect(stats.value).toEqual(someStats());
    expect(statsError.value).toBe("");
    expect(mailBudget.value).toBeNull();
    expect(mailBudgetError.value).toBe("Error connecting to server");
  });

  it("shows the API's own error", async () => {
    const refusal = { error: "You do not have permission to perform this action." };
    answer(fetchMock, {
      stats: async () => jsonResponse(403, refusal),
      mailBudget: async () => jsonResponse(403, refusal)
    });
    const { statsError, mailBudgetError, load } = useAdminOverview();
    await load();

    expect(statsError.value).toBe(refusal.error);
    expect(mailBudgetError.value).toBe(refusal.error);
  });

  it("drops a load that a newer one replaced", async () => {
    // The first load's two requests wait, and are aborted by the second.
    const first = [deferResponse(fetchMock), deferResponse(fetchMock)];
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { ...someStats(), users: 7 }))
      .mockResolvedValueOnce(jsonResponse(200, aMailBudget({ sentToday: 7 })));
    const { api } = mountComposable(() => useAdminOverview());

    const replaced = api.load();
    await api.load();
    await replaced;
    first.forEach(({ respond }) => respond(jsonResponse(200, someStats())));
    await flushPromises();

    expect(api.stats.value?.users).toBe(7);
    expect(api.mailBudget.value?.sentToday).toBe(7);
    expect(api.statsError.value).toBe("");
    expect(api.mailBudgetError.value).toBe("");
    expect(api.isLoading.value).toBe(false);
  });

  it("aborts its loads when the page goes away", async () => {
    deferResponse(fetchMock);
    deferResponse(fetchMock);
    const { api, wrapper } = mountComposable(() => useAdminOverview());

    const loading = api.load();
    const signal = fetchMock.mock.calls[0]![1]!.signal!;
    wrapper.unmount();
    await loading;

    expect(signal.aborted).toBe(true);
    expect(api.stats.value).toBeNull();
    expect(api.statsError.value).toBe("");
    expect(api.mailBudgetError.value).toBe("");
  });
});
