import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import {
  PENDING_REGISTRATIONS_PER_PAGE,
  usePendingRegistrations
} from "@/composables/usePendingRegistrations";
import type { AdminPendingRegistration } from "@/types/api/admin";

const pending = (id: string): AdminPendingRegistration => ({
  id,
  email: `${id}@example.com`,
  expiresAt: "2026-11-07T10:00:00.000Z"
});

const listing = (rows: AdminPendingRegistration[], page = 1, pages = 1) =>
  jsonResponse(200, {
    pendingRegistrations: rows,
    pagination: { limit: PENDING_REGISTRATIONS_PER_PAGE, page, total: rows.length, pages }
  });

const urls = (fetchMock: ReturnType<typeof mockFetch>) =>
  fetchMock.mock.calls.map(([url]) => String(url));

describe("usePendingRegistrations", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads a page without a sort", async () => {
    fetchMock.mockResolvedValueOnce(listing([pending("a")]));
    const list = usePendingRegistrations();

    await list.load();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/admin/pending-registrations?limit=20&page=1",
      { method: "GET", credentials: "include", signal: expect.any(AbortSignal) }
    );
    expect(list.registrations.value).toEqual([pending("a")]);
    expect(list.pagination.value).toMatchObject({ total: 1, pages: 1 });
  });

  it("says when the list can't load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined));
    const list = usePendingRegistrations(5);

    await list.load();

    expect(list.errorMessage.value).toBe("Failed to load the pending registrations: 500");
  });

  it("removes one and reloads, a page back when it was the last on its page", async () => {
    fetchMock.mockResolvedValueOnce(listing([pending("b")], 2, 2));
    const list = usePendingRegistrations();
    await list.goToPage(2);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { message: "Pending registration removed successfully." })
      )
      .mockResolvedValueOnce(listing([pending("a")]));
    const removing = list.remove("b");
    expect(list.removingIds.value.has("b")).toBe(true);
    await removing;

    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
    expect(urls(fetchMock).slice(1)).toEqual([
      "https://api.test/admin/pending-registrations/b",
      "https://api.test/admin/pending-registrations?limit=20&page=1"
    ]);
    expect(list.registrations.value).toEqual([pending("a")]);
    expect(list.removingIds.value.size).toBe(0);
    expect(list.removeError.value).toBe("");
  });

  it("shows the API's 404 and drops the gone row with a reload", async () => {
    const notFound = "There is no such pending registration with that ID.";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(404, { error: notFound }))
      .mockResolvedValueOnce(listing([]));
    const list = usePendingRegistrations();

    await list.remove("a");

    expect(list.removeError.value).toBe(notFound);
    expect(urls(fetchMock)).toHaveLength(2);
    expect(list.registrations.value).toEqual([]);
  });

  it("keeps the list as it was when the remove fails otherwise", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined));
    const list = usePendingRegistrations();

    await list.remove("a");

    expect(list.removeError.value).toBe("Failed to remove the pending registration: 500");
    expect(urls(fetchMock)).toHaveLength(1);
  });

  it("forgets a failed remove once the list loads again", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500, undefined))
      .mockResolvedValueOnce(listing([pending("a")], 2, 2));
    const list = usePendingRegistrations();
    await list.remove("a");
    expect(list.removeError.value).not.toBe("");

    await list.goToPage(2);

    expect(list.removeError.value).toBe("");
  });

  it("keeps each running remove busy on its own", async () => {
    const answers = [deferResponse(fetchMock), deferResponse(fetchMock)];
    const list = usePendingRegistrations();

    const first = list.remove("a");
    const second = list.remove("b");
    expect([...list.removingIds.value]).toEqual(["a", "b"]);

    fetchMock.mockResolvedValueOnce(listing([pending("a")]));
    answers[1].respond(jsonResponse(200, { message: "Pending registration removed." }));
    await second;
    expect([...list.removingIds.value]).toEqual(["a"]);

    answers[0].respond(jsonResponse(500, undefined));
    await first;
    expect(list.removingIds.value.size).toBe(0);
    expect(list.removeError.value).toBe("Failed to remove the pending registration: 500");
  });
});
