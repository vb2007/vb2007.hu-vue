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

    const clearing = limits.clear(" anna@example.com ", " 203.0.113.7 ", "");
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

  it("names the per-account limiters and the daily caps an e-mail clears, in the API's order", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "Rate limits cleared.",
        cleared: [
          "accountCodeChecksPerAccount",
          "passwordChecksPerAccount",
          "passwordResetCodeFailures",
          "emailChangeCodeFailures",
          "registrationCodeFailures"
        ]
      })
    );
    const limits = useClearRateLimits();

    await limits.clear("anna@example.com", "", "");

    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ email: "anna@example.com" }));
    expect(limits.outcome.value).toEqual({
      target: "anna@example.com",
      cleared: [
        "Wrong e-mail change and authenticator setup codes for the account, 10\u00a0in\u00a015\u00a0min",
        "Wrong passwords on the account page, per account",
        "Wrong password reset codes for the account, 20\u00a0a\u00a0day",
        "Wrong e-mail change codes for the account, 20\u00a0a\u00a0day",
        "Wrong sign-up codes for the waiting registration, 20\u00a0a\u00a0day"
      ]
    });
  });

  it("sends an OAuth client's id and names the limiters it clears", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        message: "Rate limits cleared.",
        cleared: [
          "clientChecksPerIp",
          "accountStatusPerClient",
          "authorizationsPerAccount",
          "tokenExchangesPerClient",
          "inactiveIntrospectionsPerClient"
        ]
      })
    );
    const limits = useClearRateLimits();

    await limits.clear("anna@example.com", "203.0.113.7", " spotdl ");

    expect(fetchMock.mock.calls[0][1]?.body).toBe(
      JSON.stringify({ email: "anna@example.com", ip: "203.0.113.7", clientId: "spotdl" })
    );
    expect(limits.outcome.value).toEqual({
      target: "anna@example.com, 203.0.113.7 and spotdl",
      cleared: [
        "Rejected OAuth client credentials from the IP",
        "Account status lookups by the OAuth client",
        "App sign-in approvals by the account",
        "Failed token exchanges by the OAuth client",
        "Inactive token checks by the OAuth client"
      ]
    });
  });

  it("shows the API's refusal of an unregistered client", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: "clientId must be the id of a registered OAuth client." })
    );
    const limits = useClearRateLimits();

    expect(await limits.clear("", "", "nope")).toBe(false);

    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify({ clientId: "nope" }));
    expect(limits.clearError.value).toBe("clientId must be the id of a registered OAuth client.");
    expect(limits.outcome.value).toBeNull();
  });

  it("leaves a blank field out and keeps an empty answer", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { message: "Rate limits cleared.", cleared: [] })
    );
    const limits = useClearRateLimits();

    await limits.clear("", "::1", "");

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
    await limits.clear("anna@example.com", "", "");

    expect(await limits.clear("", "1.2.3.4", "")).toBe(false);

    expect(limits.clearError.value).toBe("ip must be a valid IPv4 or IPv6 address.");
    expect(limits.outcome.value).toBeNull();
    expect(limits.isClearing.value).toBe(false);
  });
});
