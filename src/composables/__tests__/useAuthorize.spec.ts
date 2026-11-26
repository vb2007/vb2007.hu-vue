import { effectScope, type EffectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationQuery } from "vue-router";
import { flushPromises } from "@vue/test-utils";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useAuthorize } from "@/composables/useAuthorize";
import { Messages } from "@/constants/messages";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { saveGithubReturn, takeGithubReturn } from "@/scripts/authentication/githubReturn";

const PARAMS = {
  response_type: "code",
  client_id: "spotdl",
  redirect_uri: "https://spotdl.example/login/callback",
  state: "af0ifjsldkj",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  nonce: "n-0S6_WzA2Mj"
};
const CLIENT = { id: "spotdl", name: "spotdl-web", scopes: ["spotdl:submit"] };
const APPROVED = `${PARAMS.redirect_uri}?code=abc&state=${PARAMS.state}`;

describe("useAuthorize", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const navigate = vi.fn<(url: string) => void>();
  let scopes: EffectScope[];

  /** In a scope of its own, like a component's, so its window listener goes with the test. */
  const useRequest = (query: LocationQuery = PARAMS) => {
    const scope = effectScope();
    scopes.push(scope);
    return scope.run(() => useAuthorize(query, navigate))!;
  };

  /** The request with its client loaded. */
  const loaded = async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, CLIENT));
    const request = useRequest();
    await flushPromises();
    return request;
  };

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate.mockReset();
    scopes = [];
    isLoggedIn.value = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    scopes.forEach((scope) => scope.stop());
    sessionStorage.clear();
  });

  it("loads the app it's for", async () => {
    const request = await loaded();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/oauth/clients/spotdl", {
      method: "GET"
    });
    expect(request.app.value).toEqual(CLIENT);
    expect(request.problem.value).toBe("");
  });

  it.each([
    ["the API's invalid_client", { error: "invalid_client" }, Messages.OAuth.invalidClient],
    [
      "the API's invalid_redirect_uri",
      { error: "invalid_redirect_uri" },
      Messages.OAuth.invalidRedirectUri
    ],
    ["an error the page doesn't know", { error: "<b>odd</b>" }, Messages.OAuth.invalidRequest],
    ["a repeated error", { error: ["invalid_client", "x"] }, Messages.OAuth.invalidRequest],
    ["no client", { ...PARAMS, client_id: undefined }, Messages.OAuth.invalidClient],
    ["an empty client", { ...PARAMS, client_id: "" }, Messages.OAuth.invalidClient],
    ["a repeated client", { ...PARAMS, client_id: ["a", "b"] }, Messages.OAuth.invalidClient],
    ["a missing parameter", { ...PARAMS, nonce: undefined }, Messages.OAuth.invalidRequest],
    ["a repeated parameter", { ...PARAMS, state: ["a", "b"] }, Messages.OAuth.invalidRequest]
  ])("stops at %s without asking the API", async (_what, query, message) => {
    const request = useRequest(query as LocationQuery);
    await flushPromises();

    expect(request.problem.value).toBe(message);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await request.answer(true)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown client's 404", jsonResponse(404, { error: "There is no such OAuth client." })],
    ["a server error", jsonResponse(500, { error: "boom" })]
  ])("stops at %s", async (what, response) => {
    fetchMock.mockResolvedValueOnce(response);
    const request = useRequest();
    await flushPromises();

    expect(request.app.value).toBeNull();
    expect(request.problem.value).toBe(
      what.includes("404") ? Messages.OAuth.invalidClient : Messages.OAuth.clientUnavailable
    );
  });

  it.each([
    [true, APPROVED],
    [false, `${PARAMS.redirect_uri}?error=access_denied&state=${PARAMS.state}`]
  ])(
    "answers approve: %s with the parameters only, and goes where the API says",
    async (approve, redirectTo) => {
      const request = await loaded();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo }));

      const pending = request.answer(approve);
      expect(request.sending.value).toBe(approve ? "approve" : "deny");
      expect(await pending).toBe(true);

      expect(fetchMock).toHaveBeenLastCalledWith("https://api.test/oauth/authorize", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...PARAMS, approve })
      });
      expect(navigate).toHaveBeenCalledWith(redirectTo);
      // The browser is leaving: the keys stay busy.
      expect(request.sending.value).not.toBe("");
    }
  );

  it("leaves extra query values out of the answer", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, CLIENT));
    const request = useRequest({ ...PARAMS, mfa: "required", oauthError: "x" });
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo: APPROVED }));

    await request.answer(true);

    expect(JSON.parse(fetchMock.mock.lastCall![1]!.body as string)).toEqual({
      ...PARAMS,
      approve: true
    });
  });

  it("sends one answer at a time", async () => {
    const request = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo: APPROVED }));

    const first = request.answer(true);
    expect(await request.answer(false)).toBe(false);
    await first;

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ends the request at the API's 400, never showing its developer text", async () => {
    const request = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Send response_type=code, …" }));

    expect(await request.answer(true)).toBe(false);

    expect(request.problem.value).toBe(Messages.OAuth.invalidRequest);
    expect(request.error.value).toBe("");
    expect(request.sending.value).toBe("");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("holds both answers for the 429's wait, with its message", async () => {
    const request = await loaded();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many authorization requests", retryAfter: 42 })
    );

    await request.answer(false);

    expect(request.error.value).toBe("Too many authorization requests");
    expect(request.hold.isHeld()).toBe(true);
    expect(request.hold.remaining.value).toBe(42);
    expect(await request.answer(true)).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("says the 429 in its own words without the API's", async () => {
    const request = await loaded();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, {}));

    await request.answer(true);

    expect(request.error.value).toBe(Messages.OAuth.tooManyRequests);
  });

  it("shows another failure, which may work again", async () => {
    const request = await loaded();
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));

    await request.answer(true);

    expect(request.error.value).toBe(Messages.connectionError);
    expect(request.problem.value).toBe("");
    expect(request.sending.value).toBe("");
  });

  it("says nothing when the session ended meanwhile: the login takes over", async () => {
    const request = await loaded();
    fetchMock.mockImplementationOnce(async () => {
      isLoggedIn.value = false;
      return jsonResponse(403, { error: Messages.Auth.notLoggedIn });
    });

    await request.answer(true);

    expect(request.error.value).toBe("");
    expect(request.problem.value).toBe("");
  });

  it("forgets a GitHub login's return, on the page and back from the cache", async () => {
    saveGithubReturn("/authorize?state=x");
    const request = await loaded();
    expect(takeGithubReturn()).toBe("");

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { redirectTo: APPROVED }));
    await request.answer(true);
    saveGithubReturn("/authorize?state=x");
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    expect(request.sending.value).toBe("approve");

    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    expect(request.sending.value).toBe("");
    expect(takeGithubReturn()).toBe("");
  });

  it("navigates with location.assign by default", async () => {
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, CLIENT))
      .mockResolvedValueOnce(jsonResponse(200, { redirectTo: APPROVED }));
    const scope = effectScope();
    scopes.push(scope);
    const request = scope.run(() => useAuthorize(PARAMS))!;
    await flushPromises();

    await request.answer(true);

    expect(assign).toHaveBeenCalledWith(APPROVED);
  });
});
