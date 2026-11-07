import { beforeEach, describe, expect, it, vi } from "vitest";
import { useUploadUsage } from "@/composables/useUploadUsage";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { someUsage } from "@/__tests__/helpers/uploads";

describe("useUploadUsage", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads the user's storage", async () => {
    const answer = deferResponse(fetchMock);
    const { usage, isLoading, load } = useUploadUsage();

    const loading = load();
    expect(isLoading.value).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/uploads/usage", {
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });

    answer.respond(jsonResponse(200, someUsage()));
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

  it("shows each load's usage in turn when the answers come in order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, someUsage({ usedBytes: 1 })))
      .mockResolvedValueOnce(jsonResponse(200, someUsage({ usedBytes: 2 })));
    const { usage, isLoading, load } = useUploadUsage();

    await load();
    expect(usage.value?.usedBytes).toBe(1);
    await load();

    expect(usage.value?.usedBytes).toBe(2);
    expect(isLoading.value).toBe(false);
  });

  it("ignores an earlier load's answer that arrives after the newer one's", async () => {
    const earlier = deferResponse(fetchMock, { ignoreAbort: true });
    const newer = deferResponse(fetchMock);
    const { usage, isLoading, errorMessage, load } = useUploadUsage();

    const loadingEarlier = load();
    const loadingNewer = load();
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);

    newer.respond(jsonResponse(200, someUsage({ usedBytes: 2 })));
    await loadingNewer;
    earlier.respond(jsonResponse(200, someUsage({ usedBytes: 1 })));
    await loadingEarlier;

    expect(usage.value?.usedBytes).toBe(2);
    expect(errorMessage.value).toBe("");
    expect(isLoading.value).toBe(false);
  });

  it("keeps the usage shown, without an error, when a load is aborted", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, someUsage({ usedBytes: 1 })));
    deferResponse(fetchMock);
    const { api, wrapper } = mountComposable(() => useUploadUsage());
    await api.load();

    const pending = api.load();
    wrapper.unmount();
    await pending;

    expect(fetchMock.mock.calls[1][1]!.signal!.aborted).toBe(true);
    expect(api.usage.value?.usedBytes).toBe(1);
    expect(api.errorMessage.value).toBe("");
    expect(console.error).not.toHaveBeenCalled();
  });
});
