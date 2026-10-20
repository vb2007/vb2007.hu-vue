import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadUsage } from "@/composables/useUploadUsage";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { someUsage } from "@/__tests__/helpers/uploads";

describe("useUploadUsage", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the user's storage", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { usage, isLoading, load } = useUploadUsage();

    const loading = load();
    expect(isLoading.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/uploads/usage", {
      method: "GET",
      credentials: "include"
    });

    respond(jsonResponse(200, someUsage()));
    await loading;
    expect(usage.value).toEqual(someUsage());
    expect(isLoading.value).toBe(false);
  });

  it("shows the API's error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "You are not logged in." }));
    const { usage, errorMessage, load } = useUploadUsage();
    await load();

    expect(usage.value).toBeNull();
    expect(errorMessage.value).toBe("You are not logged in.");
  });

  it("says when the server can't be reached", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    const { errorMessage, load } = useUploadUsage();
    await load();

    expect(errorMessage.value).toBe("Error connecting to server");
  });
});
