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

  it("keeps who shared the link and when, but nothing else about them", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        originalUrl: "https://github.com",
        addedBy: { _id: "u1", username: "test", email: "test@example.com" },
        addedOn: "2026-08-04T15:45:29.680Z"
      })
    );
    const link = useShortLink(navigate);

    await link.resolve("abc123");

    expect(link.details.value).toEqual({ addedBy: "test", addedOn: "2026-08-04T15:45:29.680Z" });
  });

  it("copes with a lookup that has no sharer details", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { originalUrl: "https://github.com", addedBy: null })
    );
    const link = useShortLink(navigate);

    await link.resolve("abc123");

    expect(link.details.value).toEqual({ addedBy: undefined, addedOn: undefined });
  });

  it("stops at the target when previewing", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { originalUrl: "https://github.com", addedBy: { username: "test" } })
    );
    const link = useShortLink(navigate);

    await link.resolve("abc123", true);

    expect(link.state.value).toBe("previewing");
    expect(link.target.value).toBe("https://github.com");
    expect(link.details.value.addedBy).toBe("test");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("previews the API's redirect while the lookup endpoint doesn't exist", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404));
    const link = useShortLink(navigate);

    await link.resolve("abc123", true);

    expect(link.state.value).toBe("previewing");
    expect(link.target.value).toBe("https://api.test/r/abc123");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("forgets the previous link's details when resolving another", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, { originalUrl: "https://github.com", addedBy: { username: "test" } })
      )
      .mockResolvedValueOnce(jsonResponse(404, { error: "Not found." }));
    const link = useShortLink(navigate);

    await link.resolve("one");
    await link.resolve("two");

    expect(link.details.value).toEqual({});
  });

  it("refuses targets that would run code on this site", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { originalUrl: "javascript:alert(1)", addedBy: { username: "mallory" } })
    );
    const link = useShortLink(navigate);

    await link.resolve("evil", true);

    expect(link.state.value).toBe("unsafe");
    expect(navigate).not.toHaveBeenCalled();
    expect(link.target.value).toBe("");
    expect(link.details.value.addedBy).toBe("mallory");
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
