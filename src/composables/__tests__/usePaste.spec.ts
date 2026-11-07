import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { usePaste } from "@/composables/usePaste";

const paste = {
  _id: "p1",
  content: "hello world",
  addedBy: "u1",
  addedOn: "2026-10-10T12:00:00.000Z"
};

describe("usePaste", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("loads a paste by ID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { paste }));
    const single = usePaste();

    const pending = single.load("p1");
    expect(single.isLoading.value).toBe(true);
    await pending;

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/paste/p1", {
      method: "GET",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(single.paste.value).toEqual(paste);
    expect(single.errorMessage.value).toBe("");
    expect(single.isLoading.value).toBe(false);
  });

  it("shows each paste in turn when the answers come in order", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { paste }))
      .mockResolvedValueOnce(jsonResponse(200, { paste: { ...paste, _id: "p2" } }));
    const single = usePaste();

    await single.load("p1");
    expect(single.paste.value?._id).toBe("p1");
    await single.load("p2");

    expect(single.paste.value?._id).toBe("p2");
    expect(single.isLoading.value).toBe(false);
  });

  it("ignores the previous paste's answer when it arrives after the next one's", async () => {
    const first = deferResponse(fetchMock, { ignoreAbort: true });
    const second = deferResponse(fetchMock);
    const single = usePaste();

    const loadingFirst = single.load("p1");
    const loadingSecond = single.load("p2");
    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);

    second.respond(jsonResponse(200, { paste: { ...paste, _id: "p2" } }));
    await loadingSecond;
    first.respond(jsonResponse(200, { paste }));
    await loadingFirst;

    expect(single.paste.value?._id).toBe("p2");
    expect(single.isLoading.value).toBe(false);
  });

  it("leaves an aborted load's paste to the next one, without an error", async () => {
    deferResponse(fetchMock);
    const second = deferResponse(fetchMock);
    const single = usePaste();

    const loadingFirst = single.load("p1");
    const loadingSecond = single.load("p2");
    await loadingFirst;
    expect(single.errorMessage.value).toBe("");
    expect(single.isLoading.value).toBe(true);

    second.respond(jsonResponse(200, { paste: { ...paste, _id: "p2" } }));
    await loadingSecond;
    expect(single.paste.value?._id).toBe("p2");
    expect(single.isLoading.value).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("aborts the load in flight when it goes away", async () => {
    deferResponse(fetchMock);
    const { api, wrapper } = mountComposable(() => usePaste());

    const pending = api.load("p1");
    wrapper.unmount();
    await pending;

    expect(fetchMock.mock.calls[0][1]!.signal!.aborted).toBe(true);
    expect(api.errorMessage.value).toBe("");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("explains a malformed ID", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: "Invalid ID format: must be a 24 character HEX string." })
    );
    const single = usePaste();

    await single.load("nope");

    expect(single.errorMessage.value).toBe("That isn't a valid paste link.");
    expect(single.paste.value).toBeNull();
  });

  it("shows the API's error for a missing paste", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such paste with that ID." })
    );
    const single = usePaste();

    await single.load("p404");

    expect(single.errorMessage.value).toBe("There is no such paste with that ID.");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const single = usePaste();

    await single.load("p1");

    expect(single.errorMessage.value).toBe("Error connecting to server");
    expect(single.isLoading.value).toBe(false);
  });

  describe("setLanguage", () => {
    const owned = { ...paste, addedBy: { _id: "u1", username: "anna" }, language: "plaintext" };

    const loaded = async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { paste: owned }));
      const single = usePaste();
      await single.load("p1");
      return single;
    };

    it("does nothing before a paste is loaded", async () => {
      const single = usePaste();

      await single.setLanguage("python");

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("saves the language and keeps the rest of the paste", async () => {
      const single = await loaded();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(200, { paste: { ...paste, language: "python" } })
      );

      const pending = single.setLanguage("python");
      expect(single.isSaving.value).toBe(true);
      await pending;

      expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/paste/p1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "python" }),
        credentials: "include"
      });
      expect(single.paste.value).toEqual({ ...owned, language: "python" });
      expect(single.saveError.value).toBe("");
      expect(single.isSaving.value).toBe(false);
    });

    it("shows the API's error and keeps the old language", async () => {
      const single = await loaded();
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "You are not authorized." }));

      await single.setLanguage("python");

      expect(single.saveError.value).toBe("You are not authorized.");
      expect(single.paste.value?.language).toBe("plaintext");
      expect(single.isSaving.value).toBe(false);
    });

    it("reports an unreachable server", async () => {
      const single = await loaded();
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await single.setLanguage("python");

      expect(single.saveError.value).toBe("Error connecting to server");
      expect(single.isSaving.value).toBe(false);
    });
  });
});
