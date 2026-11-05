import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { Endpoints } from "@/constants/endpoints";
import { HttpMethod, HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import {
  apiErrorOf,
  apiHost,
  apiRequest,
  apiUrl,
  errorMessageFrom,
  readJson,
  type ApiFailure
} from "@/scripts/api/client";
import { defineEndpoint } from "@/scripts/api/endpoint";
import type { ApiErrorBody } from "@/types/api/common";

const failure = "Failed to do it";

describe("apiUrl", () => {
  it("joins the base URL and a path without params", () => {
    expect(apiUrl(Endpoints.Pastebin.create)).toBe("https://api.test/paste");
  });

  it("encodes every path param", () => {
    expect(apiUrl(Endpoints.Pastebin.get, { params: { id: "a b/c" } })).toBe(
      "https://api.test/paste/a%20b%2Fc"
    );
    expect(apiUrl(Endpoints.Admin.setUploadQuota, { params: { id: "u 9" } })).toBe(
      "https://api.test/admin/users/u%209/upload-quota"
    );
  });

  it("adds the query in order, encoded, without undefined values", () => {
    const search = defineEndpoint<undefined, unknown, { q?: string; page: number }>()({
      method: HttpMethod.Get,
      path: "/search",
      credentials: false
    });

    expect(apiUrl(search, { query: { q: "Anna B", page: 2 } })).toBe(
      "https://api.test/search?q=Anna+B&page=2"
    );
    expect(apiUrl(search, { query: { q: undefined, page: 1 } })).toBe(
      "https://api.test/search?page=1"
    );
  });

  it("leaves out the question mark when the query is empty", () => {
    const list = defineEndpoint<undefined, unknown, { q?: string }>()({
      method: HttpMethod.Get,
      path: "/uploads",
      credentials: true
    });

    expect(apiUrl(list, { query: {} })).toBe("https://api.test/uploads");
  });

  it("rejects missing or misspelled params at compile time", () => {
    // @ts-expect-error The path needs an id.
    expect(apiUrl(Endpoints.Pastebin.get)).toBe("https://api.test/paste/undefined");
    // @ts-expect-error The param is called id.
    expect(apiUrl(Endpoints.Pastebin.get, { params: { pasteId: "a" } })).toBe(
      "https://api.test/paste/undefined"
    );
  });
});

describe("apiHost", () => {
  it("is the host of the API's base URL, without the scheme", () => {
    expect(apiHost()).toBe("api.test");
  });
});

describe("readJson", () => {
  it("parses the body", async () => {
    expect(await readJson(jsonResponse(200, { a: 1 }))).toEqual({ a: 1 });
  });

  it("is null when the body is not JSON", async () => {
    expect(await readJson(jsonResponse(502))).toBeNull();
  });
});

describe("errorMessageFrom", () => {
  it("prefers the API's error message", () => {
    expect(errorMessageFrom({ error: "No such paste." }, 404, "Not Found", failure)).toBe(
      "No such paste."
    );
  });

  it.each([
    [{}, "Forbidden", 403, `${failure}: Forbidden`],
    [{ error: "" }, "Forbidden", 403, `${failure}: Forbidden`],
    [{ error: 42 }, "", 400, `${failure}: 400`],
    [null, "", 500, `${failure}: 500`]
  ])("falls back to the status for %j", (body, statusText, status, message) => {
    expect(errorMessageFrom(body, status, statusText, failure)).toBe(message);
  });
});

describe("apiErrorOf", () => {
  const http = (body: unknown): ApiFailure => ({
    ok: false,
    kind: "http",
    status: 400,
    error: failure,
    body: body as ApiErrorBody | null
  });

  it("is the API's own message", () => {
    expect(apiErrorOf(http({ error: "Wrong password." }))).toBe("Wrong password.");
  });

  it.each([[{}], [{ error: "" }], [{ error: 42 }], [null]])("is undefined for %j", (body) => {
    expect(apiErrorOf(http(body))).toBeUndefined();
  });

  it("is undefined when the API never answered", () => {
    expect(
      apiErrorOf({ ok: false, kind: "network", status: 0, error: Messages.connectionError })
    ).toBeUndefined();
  });
});

describe("apiRequest", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("returns the typed body on success", async () => {
    const paste = { _id: "a", content: "hi", addedBy: "u", addedOn: "2026-01-01" };
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { paste }));

    const result = await apiRequest(Endpoints.Pastebin.get, { params: { id: "a" }, failure });

    expect(result).toEqual({ ok: true, status: 200, data: { paste } });
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/paste/a", {
      method: "GET",
      credentials: "include"
    });
  });

  it("sends a JSON body with its content type", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "ok" }));

    await apiRequest(Endpoints.Pastebin.update, {
      params: { id: "a" },
      body: { language: "ts" },
      failure
    });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/paste/a", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: "ts" }),
      credentials: "include"
    });
  });

  it("leaves out credentials when the endpoint doesn't need the session, and passes the signal", async () => {
    const signal = new AbortController().signal;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { available: true }));

    await apiRequest(Endpoints.Auth.usernameAvailable, {
      query: { username: "Anna B" },
      signal,
      failure
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/auth/username-available?username=Anna+B",
      { method: "GET", signal }
    );
  });

  it("doesn't log a status the caller expects", async () => {
    const error = "You must be logged in to perform this action.";
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error }));

    const result = await apiRequest(Endpoints.User.get, {
      failure,
      quietStatuses: [HttpStatus.Forbidden]
    });

    expect(result).toMatchObject({ ok: false, kind: "http", status: 403, error });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("passes the endpoint's redirect mode", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "bye" }));

    await apiRequest(Endpoints.Auth.logout, { failure });

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/logout", {
      method: "POST",
      credentials: "include",
      redirect: "manual"
    });
  });

  it("returns the API's error with its body", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: "Wait.", retryAfter: 30 }));

    const result = await apiRequest(Endpoints.Pastebin.create, {
      body: { paste: "hi", language: "plaintext" },
      failure
    });

    expect(result).toEqual({
      ok: false,
      kind: "http",
      status: 429,
      error: "Wait.",
      body: { error: "Wait.", retryAfter: 30 }
    });
    expect(console.error).toHaveBeenCalledWith(`${failure}: `, 429);
  });

  it("returns the API's message for a server error", async () => {
    const error = "Something went wrong on the server: please try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error }, "Internal Server Error"));

    const result = await apiRequest(Endpoints.Pastebin.remove, { params: { id: "a" }, failure });

    expect(result).toEqual({ ok: false, kind: "http", status: 500, error, body: { error } });
    expect(console.error).toHaveBeenCalledWith(`${failure}: `, 500);
  });

  it("falls back to the failure text when the error has no JSON body", async () => {
    // A gateway's own page while the API is down, not the API's answer.
    fetchMock.mockResolvedValueOnce(jsonResponse(502, undefined, "Bad Gateway"));

    const result = await apiRequest(Endpoints.Pastebin.remove, { params: { id: "a" }, failure });

    expect(result).toEqual({
      ok: false,
      kind: "http",
      status: 502,
      error: `${failure}: Bad Gateway`,
      body: null
    });
  });

  it("treats a success without a JSON body as a failure", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));

    const result = await apiRequest(Endpoints.Pastebin.remove, { params: { id: "a" }, failure });

    expect(result).toEqual({
      ok: false,
      kind: "http",
      status: 200,
      error: `${failure}: 200`,
      body: null
    });
  });

  it("reports a request that got no answer", async () => {
    const error = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValueOnce(error);

    const result = await apiRequest(Endpoints.Pastebin.remove, { params: { id: "a" }, failure });

    expect(result).toEqual({
      ok: false,
      kind: "network",
      status: 0,
      error: Messages.connectionError
    });
    expect(console.error).toHaveBeenCalledWith(`${failure}: `, error);
  });

  it("doesn't log a request its caller aborted", async () => {
    const request = new AbortController();
    fetchMock.mockImplementationOnce(() => {
      request.abort();
      return Promise.reject(new DOMException("Aborted", "AbortError"));
    });

    const result = await apiRequest(Endpoints.Auth.usernameAvailable, {
      query: { username: "anna" },
      signal: request.signal,
      failure
    });

    expect(result).toEqual({
      ok: false,
      kind: "aborted",
      status: 0,
      error: Messages.requestAborted
    });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("doesn't log a request aborted while its body was read", async () => {
    const request = new AbortController();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "",
      json: () => {
        request.abort();
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
    } as unknown as Response);

    const result = await apiRequest(Endpoints.Auth.usernameAvailable, {
      query: { username: "anna" },
      signal: request.signal,
      failure
    });

    expect(result).toMatchObject({ ok: false, kind: "aborted" });
    expect(console.error).not.toHaveBeenCalled();
  });

  it("still logs a failure when the signal wasn't aborted", async () => {
    const { signal } = new AbortController();
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await apiRequest(Endpoints.Auth.usernameAvailable, {
      query: { username: "anna" },
      signal,
      failure
    });

    expect(result).toMatchObject({ ok: false, kind: "network" });
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("rejects a wrong body at compile time", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { message: "ok" }));

    await apiRequest(Endpoints.Pastebin.update, {
      params: { id: "a" },
      // @ts-expect-error The update body is { language }.
      body: { lang: "ts" },
      failure
    });
    // @ts-expect-error The update needs a body.
    await apiRequest(Endpoints.Pastebin.update, { params: { id: "a" }, failure });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
