import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useShortLinkDelete } from "@/composables/useShortLinkDelete";

const deleted = () => jsonResponse(200, { message: "Shortened URL deleted successfully." });

describe("useShortLinkDelete", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let afterRemove: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    afterRemove = vi.fn(() => Promise.resolve());
  });

  it("deletes a link by its code, then reloads the list", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { isDeleting, deleteError, remove } = useShortLinkDelete(afterRemove);

    const pending = remove("a b/c");
    expect(isDeleting("a b/c")).toBe(true);
    expect(isDeleting("other")).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/shortenUrl/a%20b%2Fc", {
      method: "DELETE",
      credentials: "include"
    });

    respond(deleted());

    expect(await pending).toBe(true);
    expect(afterRemove).toHaveBeenCalledOnce();
    expect(isDeleting("a b/c")).toBe(false);
    expect(deleteError.value).toEqual({ code: "", message: "" });
  });

  it("runs deletes side by side, each busy until its own answer", async () => {
    let respondFirst!: (response: Response) => void;
    let respondSecond!: (response: Response) => void;
    fetchMock
      .mockReturnValueOnce(new Promise((resolve) => (respondFirst = resolve)))
      .mockReturnValueOnce(new Promise((resolve) => (respondSecond = resolve)));
    const { isDeleting, remove } = useShortLinkDelete(afterRemove);

    const first = remove("one");
    const second = remove("two");
    expect([isDeleting("one"), isDeleting("two")]).toEqual([true, true]);

    respondSecond(deleted());
    await second;
    expect([isDeleting("one"), isDeleting("two")]).toEqual([true, false]);

    respondFirst(deleted());
    await first;
    expect(isDeleting("one")).toBe(false);
  });

  it("keeps the API's refusal of someone else's link with its code, and the list", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "You can only delete URLs created with your account." })
    );
    const { isDeleting, deleteError, remove } = useShortLinkDelete(afterRemove);

    expect(await remove("abc123")).toBe(false);

    expect(deleteError.value).toEqual({
      code: "abc123",
      message: "You can only delete URLs created with your account."
    });
    expect(afterRemove).not.toHaveBeenCalled();
    expect(isDeleting("abc123")).toBe(false);
    expect(consoleError).toHaveBeenCalled();
  });

  it("reloads the list when the link was gone already, then keeps the error, unlogged", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "The shortened URL cannot be found." })
    );
    const useDelete = useShortLinkDelete(async () => {
      // A list clears the error on every load; this one comes after the reload.
      useDelete.clearError();
    });

    expect(await useDelete.remove("abc123")).toBe(false);

    expect(useDelete.deleteError.value).toEqual({
      code: "abc123",
      message: "The shortened URL cannot be found."
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("falls back to its own text, clears it on the next try, and on clearError", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(deleted())
      .mockResolvedValueOnce(jsonResponse(500));
    const { deleteError, clearError, remove } = useShortLinkDelete(afterRemove);

    await remove("abc123");
    expect(deleteError.value.message).toBe("Failed to delete short link: 500");

    await remove("abc123");
    expect(deleteError.value.message).toBe("");

    await remove("def456");
    clearError();
    expect(deleteError.value).toEqual({ code: "", message: "" });
  });
});
