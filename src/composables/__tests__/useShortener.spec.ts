import { beforeEach, describe, expect, it, vi } from "vitest";
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

    await shortener.shorten();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(shortener.errorMessage.value).toBe("Invalid URL / URI format.");
  });

  it("stores the short code and clears the input on success", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { shortenedUrl: "abc123" } }));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com/long";

    const pending = shortener.shorten();
    expect(shortener.isLoading.value).toBe(true);
    await pending;

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/shortenUrl/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: "https://example.com/long" }),
      credentials: "include"
    });
    expect(shortener.shortenedCode.value).toBe("abc123");
    expect(shortener.shortenedLink()).toBe("https://api.test/r/abc123");
    expect(shortener.originalUrl.value).toBe("");
    expect(shortener.isLoading.value).toBe(false);
  });

  it("shows the status text when the API refuses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}, "Too Many Requests"));
    const shortener = useShortener();
    shortener.originalUrl.value = "https://example.com";

    await shortener.shorten();

    expect(shortener.errorMessage.value).toBe("Failed to shorten URL: Too Many Requests");
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

  it("has no link before anything was shortened", () => {
    expect(useShortener().shortenedLink()).toBe("");
  });

  it("reset clears the result and the error", () => {
    const shortener = useShortener();
    shortener.shortenedCode.value = "abc123";
    shortener.errorMessage.value = "oops";

    shortener.reset();

    expect(shortener.shortenedCode.value).toBe("");
    expect(shortener.errorMessage.value).toBe("");
  });
});
