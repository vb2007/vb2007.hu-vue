import { beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useShortener } from "@/composables/useShortener";

describe("useShortener", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects an invalid URL without calling the API", async () => {
    const shortener = useShortener();
    shortener.originalUrl.value = "example.com";

    expect(await shortener.shorten()).toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shortener.errorMessage.value).toBe("Invalid URL / URI format.");
  });

  it("sends a URL of exactly the API's 2000-character limit", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: { shortenedUrl: "abc123" } }));
    const shortener = useShortener();
    const url = `https://example.com/${"a".repeat(2000 - "https://example.com/".length)}`;
    shortener.originalUrl.value = url;

    await shortener.shorten();

    expect(url).toHaveLength(2000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(shortener.errorMessage.value).toBe("");
    expect(shortener.shortenedCode.value).toBe("abc123");
  });

  it("refuses a URL over the limit without calling the API", async () => {
    const shortener = useShortener();
    shortener.originalUrl.value = `https://example.com/${"a".repeat(2001 - "https://example.com/".length)}`;

    await shortener.shorten();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shortener.errorMessage.value).toBe(
      `This URL is ${(2001).toLocaleString()} characters; the limit is ${(2000).toLocaleString()}.`
    );
    expect(shortener.isLoading.value).toBe(false);
  });

  it("stores the short code and clears the input on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: { shortenedUrl: "abc123" } }));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/long";

    const pending = shortener.shorten();
    expect(shortener.isLoading.value).toBe(true);
    expect(await pending).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/shortenUrl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/long" }),
      credentials: "include"
    });
    expect(shortener.shortenedCode.value).toBe("abc123");
    expect(shortener.shortenedLink()).toBe(`${window.location.origin}/r/abc123`);
    expect(shortener.originalUrl.value).toBe("");
    expect(shortener.isLoading.value).toBe(false);
  });

  it("shows the API's error when it refuses", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "You must be logged in to perform this action." })
    );
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com";

    expect(await shortener.shorten()).toBe(false);

    expect(shortener.errorMessage.value).toBe("You must be logged in to perform this action.");
    expect(shortener.shortenedCode.value).toBe("");
    expect(shortener.isLoading.value).toBe(false);
  });

  it("falls back to the status when the API sends no error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com";

    await shortener.shorten();

    expect(shortener.errorMessage.value).toBe("Failed to shorten URL: 500");
    expect(shortener.shortenedCode.value).toBe("");
    expect(shortener.isLoading.value).toBe(false);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com";

    await shortener.shorten();

    expect(shortener.errorMessage.value).toBe("Error connecting to server");
    expect(shortener.isLoading.value).toBe(false);
  });

  it("marks a new link as new", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { data: { shortenedUrl: "abc123" } }));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/new";

    await shortener.shorten();

    expect(shortener.alreadyShortened.value).toBe(false);
  });

  it("marks the user's existing link for a URL shortened before, until the next URL is typed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "You've already shortened this URL.",
        data: { shortenedUrl: "old123" }
      })
    );
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/again";

    expect(await shortener.shorten()).toBe(true);

    expect(shortener.shortenedCode.value).toBe("old123");
    expect(shortener.alreadyShortened.value).toBe(true);
    // Clearing the field after the answer doesn't count as moving on.
    await nextTick();
    expect(shortener.alreadyShortened.value).toBe(true);

    shortener.originalUrl.value = "h";
    await nextTick();
    expect(shortener.alreadyShortened.value).toBe(false);
  });

  it("drops the mark when the next URL gets a new link", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: { shortenedUrl: "old123" } }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { shortenedUrl: "new456" } }));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/again";
    await shortener.shorten();

    shortener.originalUrl.value = "https://example.com/other";
    await nextTick();
    // Defensive: typing has cleared the mark already, so the panel can't get here; marked again by
    // hand so only the answer can clear it.
    shortener.alreadyShortened.value = true;
    await shortener.shorten();

    expect(shortener.shortenedCode.value).toBe("new456");
    expect(shortener.alreadyShortened.value).toBe(false);
  });

  it("drops the mark when the next try fails", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: { shortenedUrl: "old123" } }))
      .mockResolvedValueOnce(jsonResponse(500));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/again";
    await shortener.shorten();

    shortener.originalUrl.value = "https://example.com/other";
    await nextTick();
    // Defensive, as above: the panel can't fail a try with the mark still set.
    shortener.alreadyShortened.value = true;
    await shortener.shorten();

    expect(shortener.errorMessage.value).toBe("Failed to shorten URL: 500");
    // The slip keeps the last link, but it isn't about the URL just tried.
    expect(shortener.shortenedCode.value).toBe("old123");
    expect(shortener.alreadyShortened.value).toBe(false);
  });

  it("has no link before anything was shortened", () => {
    expect(useShortener().shortenedLink()).toBe("");
  });

  it("reset clears the result, the mark and the error", () => {
    const shortener = useShortener();
    shortener.shortenedCode.value = "abc123";
    shortener.alreadyShortened.value = true;
    shortener.errorMessage.value = "oops";

    shortener.reset();

    expect(shortener.shortenedCode.value).toBe("");
    expect(shortener.alreadyShortened.value).toBe(false);
    expect(shortener.errorMessage.value).toBe("");
  });
});
