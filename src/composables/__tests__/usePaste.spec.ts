import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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
      credentials: "include"
    });
    expect(single.paste.value).toEqual(paste);
    expect(single.errorMessage.value).toBe("");
    expect(single.isLoading.value).toBe(false);
  });

  it("explains a malformed ID", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Invalid ID format." }));
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
