import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useShortLink } from "@/composables/useShortLink";

describe("useShortLink", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let navigate: ReturnType<typeof vi.fn<(url: string) => void>>;

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate = vi.fn<(url: string) => void>();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("looks the code up and goes to its target", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://example.com/long" }));
    const link = useShortLink(navigate);

    const pending = link.resolve("a b");
    expect(link.state.value).toBe("resolving");
    await pending;

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/shortenUrl/a%20b", { method: "GET" });
    expect(link.state.value).toBe("redirecting");
    expect(link.target.value).toBe("https://example.com/long");
    expect(navigate).toHaveBeenCalledWith("https://example.com/long");
  });

  it("refuses targets that would run code on this site", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { originalUrl: "javascript:alert(1)" }));
    const link = useShortLink(navigate);

    await link.resolve("evil");

    expect(link.state.value).toBe("unsafe");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("shows the API's error for an unknown code", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "The shortened URL cannot be found." })
    );
    const link = useShortLink(navigate);

    await link.resolve("nope");

    expect(link.state.value).toBe("not-found");
    expect(link.errorMessage.value).toBe("The shortened URL cannot be found.");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("falls back to the API's own redirect while the lookup endpoint doesn't exist", async () => {
    // An API without the endpoint answers Express's default HTML 404.
    fetchMock.mockResolvedValueOnce(jsonResponse(404));
    const link = useShortLink(navigate);

    await link.resolve("abc123");

    expect(link.state.value).toBe("redirecting");
    expect(navigate).toHaveBeenCalledWith("https://api.test/r/abc123");
  });

  it("also falls back when the lookup answers without a target", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
    const link = useShortLink(navigate);

    await link.resolve("abc123");

    expect(navigate).toHaveBeenCalledWith("https://api.test/r/abc123");
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const link = useShortLink(navigate);

    await link.resolve("abc123");

    expect(link.state.value).toBe("error");
    expect(link.errorMessage.value).toBe("Error connecting to server");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("navigates with location.replace by default", async () => {
    const replace = vi.fn();
    vi.stubGlobal("location", { ...window.location, replace });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://example.com" }));

    await useShortLink().resolve("abc123");

    expect(replace).toHaveBeenCalledWith("https://example.com");
  });
});
