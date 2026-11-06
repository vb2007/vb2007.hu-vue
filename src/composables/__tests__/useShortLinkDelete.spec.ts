import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useShortLinkDelete } from "@/composables/useShortLinkDelete";

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
    const { deletingCode, deleteError, remove } = useShortLinkDelete(afterRemove);

    const pending = remove("a b/c");
    expect(deletingCode.value).toBe("a b/c");
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/shortenUrl/a%20b%2Fc", {
      method: "DELETE",
      credentials: "include"
    });

    respond(jsonResponse(200, { message: "Shortened URL deleted successfully." }));

    expect(await pending).toBe(true);
    expect(afterRemove).toHaveBeenCalledOnce();
    expect(deletingCode.value).toBe("");
    expect(deleteError.value).toBe("");
  });

  it("shows the API's refusal of someone else's link and keeps the list", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "You can only delete URLs created with your account." })
    );
    const { deletingCode, deleteError, remove } = useShortLinkDelete(afterRemove);

    expect(await remove("abc123")).toBe(false);

    expect(deleteError.value).toBe("You can only delete URLs created with your account.");
    expect(afterRemove).not.toHaveBeenCalled();
    expect(deletingCode.value).toBe("");
    expect(consoleError).toHaveBeenCalled();
  });

  it("reloads the list when the link was gone already, without logging it", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "The shortened URL cannot be found." })
    );
    const { deleteError, remove } = useShortLinkDelete(afterRemove);

    expect(await remove("abc123")).toBe(false);

    expect(deleteError.value).toBe("The shortened URL cannot be found.");
    expect(afterRemove).toHaveBeenCalledOnce();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("falls back to its own text and clears it on the next try", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Shortened URL deleted successfully." }));
    const { deleteError, remove } = useShortLinkDelete(afterRemove);

    await remove("abc123");
    expect(deleteError.value).toBe("Failed to delete short link: 500");

    await remove("abc123");
    expect(deleteError.value).toBe("");
  });
});
