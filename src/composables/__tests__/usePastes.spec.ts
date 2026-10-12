import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { PASTES_PER_PAGE, usePastes } from "@/composables/usePastes";
import { username } from "@/scripts/authentication/authState";

const paste = (id: string) => ({
  _id: id,
  content: `paste ${id}`,
  addedBy: { _id: "u1", username: "me" },
  addedOn: "2026-10-10T12:00:00.000Z"
});

const page = (pastes: ReturnType<typeof paste>[], pageNumber = 1, pages = 1) =>
  jsonResponse(200, {
    pastes,
    pagination: {
      limit: PASTES_PER_PAGE,
      page: pageNumber,
      total: pastes.length,
      pages,
      sortBy: "addedOn",
      sortOrder: "desc"
    }
  });

const listUrl = (query: string) => `https://api.test/pastes/me?${query}`;

describe("usePastes", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    username.value = "me";
  });

  it("loads the user's newest pastes first", async () => {
    fetchMock.mockResolvedValueOnce(page([paste("p1")]));
    const list = usePastes();

    const pending = list.load();
    expect(list.isLoading.value).toBe(true);
    await pending;

    expect(fetchMock).toHaveBeenCalledWith(
      listUrl("limit=10&page=1&sortBy=addedOn&sortOrder=desc"),
      { method: "GET", credentials: "include" }
    );
    expect(list.pastes.value).toEqual([paste("p1")]);
    expect(list.pagination.value).toMatchObject({ page: 1, pages: 1, total: 1 });
    expect(list.isLoading.value).toBe(false);
  });

  it("escapes the username in the path", async () => {
    username.value = "a b/c";
    fetchMock.mockResolvedValueOnce(page([]));

    await usePastes(5).load();

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.test/pastes/a%20b%2Fc?limit=5&page=1&sortBy=addedOn&sortOrder=desc"
    );
  });

  it("goes to another page", async () => {
    fetchMock.mockResolvedValueOnce(page([paste("p11")], 2, 2));
    const list = usePastes();

    await list.goToPage(2);

    expect(list.page.value).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      listUrl("limit=10&page=2&sortBy=addedOn&sortOrder=desc")
    );
  });

  it("changing the order starts from the first page again", async () => {
    fetchMock.mockResolvedValueOnce(page([paste("p1")]));
    const list = usePastes();
    list.page.value = 3;

    await list.setSortOrder("asc");

    expect(list.page.value).toBe(1);
    expect(list.sortOrder.value).toBe("asc");
    expect(fetchMock.mock.calls[0][0]).toBe(
      listUrl("limit=10&page=1&sortBy=addedOn&sortOrder=asc")
    );
  });

  it("shows the API's error when listing fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that username." })
    );
    const list = usePastes();

    await list.load();

    expect(list.errorMessage.value).toBe("There is no such user with that username.");
    expect(list.isLoading.value).toBe(false);
  });

  it("reports an unreachable server when listing", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const list = usePastes();

    await list.load();

    expect(list.errorMessage.value).toBe("Error connecting to server");
  });

  it("deletes a paste and reloads the page", async () => {
    let respond!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (respond = resolve)))
      .mockResolvedValueOnce(page([paste("p2")]));
    const list = usePastes();
    list.pastes.value = [paste("p1"), paste("p2")];

    const pending = list.remove("p1");
    expect(list.deletingId.value).toBe("p1");
    respond(jsonResponse(200, { message: "Paste deleted successfully." }));
    await pending;

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/paste/p1", {
      method: "DELETE",
      credentials: "include"
    });
    expect(fetchMock.mock.calls[1][0]).toBe(
      listUrl("limit=10&page=1&sortBy=addedOn&sortOrder=desc")
    );
    expect(list.pastes.value).toEqual([paste("p2")]);
    expect(list.deletingId.value).toBe("");
  });

  it("steps back a page after deleting the last paste on it", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, {}))
      .mockResolvedValueOnce(page([paste("p1")], 1, 1));
    const list = usePastes();
    list.page.value = 2;
    list.pastes.value = [paste("p11")];

    await list.remove("p11");

    expect(list.page.value).toBe(1);
    expect(fetchMock.mock.calls[1][0]).toBe(
      listUrl("limit=10&page=1&sortBy=addedOn&sortOrder=desc")
    );
  });

  it("stays on the first page when its last paste is deleted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {})).mockResolvedValueOnce(page([]));
    const list = usePastes();
    list.pastes.value = [paste("p1")];

    await list.remove("p1");

    expect(list.page.value).toBe(1);
    expect(list.pastes.value).toEqual([]);
  });

  it("shows the API's error when deleting fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such paste with that ID." })
    );
    const list = usePastes();

    await list.remove("p404");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(list.deleteError.value).toBe("There is no such paste with that ID.");
    expect(list.deletingId.value).toBe("");
  });

  it("reports an unreachable server when deleting", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const list = usePastes();

    await list.remove("p1");

    expect(list.deleteError.value).toBe("Error connecting to server");
  });
});
