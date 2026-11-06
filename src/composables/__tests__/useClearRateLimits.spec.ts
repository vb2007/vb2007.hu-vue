import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useClearRateLimits } from "@/composables/useClearRateLimits";

describe("useClearRateLimits", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("sends the trimmed fields and names what was cleared in plain words", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "Rate limits cleared.",
        cleared: ["loginPerIp", "loginPerAccount", "somethingNew"]
      })
    );
    const limits = useClearRateLimits();

    const clearing = limits.clear(" anna@example.com ", " 203.0.113.7 ");
    expect(limits.isClearing.value).toBe(true);
    expect(await clearing).toBe(true);

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/admin/rate-limits", {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "anna@example.com", ip: "203.0.113.7" })
    });
    expect(limits.outcome.value).toEqual({
      target: "anna@example.com and 203.0.113.7",
      cleared: [
        "Failed log-ins from the IP",
        "Failed log-ins to the address from the IP",
        // A limiter added on the API later keeps its own name.
        "somethingNew"
      ]
    });
    expect(limits.isClearing.value).toBe(false);
  });

  it("leaves a blank field out and keeps an empty answer", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "Rate limits cleared.", cleared: [] })
    );
    const limits = useClearRateLimits();

    await limits.clear("", "::1");

    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ ip: "::1" }));
    expect(limits.outcome.value).toEqual({ target: "::1", cleared: [] });
  });

  it("shows the API's refusal and forgets the last outcome", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: "Rate limits cleared.", cleared: [] }))
      .mockResolvedValueOnce(
        jsonResponse(400, { error: "ip must be a valid IPv4 or IPv6 address." })
      );
    const limits = useClearRateLimits();
    await limits.clear("anna@example.com", "");

    expect(await limits.clear("", "1.2.3.4")).toBe(false);

    expect(limits.clearError.value).toBe("ip must be a valid IPv4 or IPv6 address.");
    expect(limits.outcome.value).toBeNull();
    expect(limits.isClearing.value).toBe(false);
  });
});
