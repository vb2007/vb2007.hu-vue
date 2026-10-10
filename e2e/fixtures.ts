import { test as base, expect, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`,
 * `api.hasPaste(...)`) before navigating. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one.
 *
 * Requests this mock doesn't know are aborted and fail the test at teardown, so e2e runs can
 * never reach a real server. Add a case to `respond` when the app starts calling a new endpoint.
 */
export interface MockPaste {
  _id: string;
  content: string;
  addedBy: string;
  addedOn: string;
}

export class MockApi {
  private user: { email: string; username: string } | null = null;
  private shortCode = "e2e123";
  /** In-memory paste store, oldest first. */
  readonly pastes: MockPaste[] = [];
  private nextPasteId = 1;
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  loggedInAs(email = "e2e@example.com", username = "e2e") {
    this.user = { email, username };
  }

  /** Stores a paste as if `username` had created it, and returns it. */
  hasPaste(content: string, username = "e2e") {
    const id = `${this.nextPasteId++}`.padStart(24, "0");
    // Each paste is a minute newer than the last, so sorting by date is deterministic.
    const addedOn = new Date(Date.UTC(2026, 9, 10, 12, this.pastes.length)).toISOString();
    const paste = { _id: id, content, addedBy: username, addedOn };
    this.pastes.push(paste);
    return paste;
  }

  shortenReturns(code: string) {
    this.shortCode = code;
  }

  async handle(route: Route, appOrigin: string) {
    const request = route.request();
    // The app calls the API cross-origin with credentials, so every answer needs CORS headers.
    const headers = {
      "Access-Control-Allow-Origin": appOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS"
    };
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    const url = new URL(request.url());
    const response = this.respond(
      `${request.method()} ${url.pathname}`,
      request.postDataJSON(),
      url.searchParams
    );
    if (!response) {
      this.unhandled.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    return route.fulfill({ status: response.status, headers, json: response.body ?? {} });
  }

  private respond(
    endpoint: string,
    body: { email?: string; paste?: string } | null,
    query: URLSearchParams
  ): { status: number; body?: unknown } | undefined {
    const pasteRoute = endpoint.match(/^(GET|DELETE) \/paste\/([^/]+)$/);
    if (pasteRoute) {
      return this.respondPaste(pasteRoute[1], decodeURIComponent(pasteRoute[2]));
    }
    const listRoute = endpoint.match(/^GET \/pastes\/([^/]+)$/);
    if (listRoute) {
      return this.listPastes(decodeURIComponent(listRoute[1]), query);
    }

    switch (endpoint) {
      case "GET /user":
        return this.user ? { status: 200, body: this.user } : { status: 401 };
      case "POST /auth/login":
        this.user = { email: body?.email ?? "e2e@example.com", username: "e2e" };
        return { status: 200 };
      case "POST /auth/logout":
        this.user = null;
        return { status: 200 };
      case "POST /auth/register":
        return { status: 201 };
      case "POST /shortenUrl/create":
        return { status: 200, body: { data: { shortenedUrl: this.shortCode } } };
      case "POST /paste":
        if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
        return {
          status: 201,
          body: {
            message: "Paste created successfully.",
            paste: this.hasPaste(body?.paste ?? "", this.user.username)
          }
        };
      default:
        return undefined;
    }
  }

  private respondPaste(method: string, id: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) {
      return { status: 400, body: { error: "Invalid ID format." } };
    }
    const index = this.pastes.findIndex((paste) => paste._id === id);
    if (index === -1) {
      return { status: 404, body: { error: "There is no such paste with that ID." } };
    }
    if (method === "GET") {
      return { status: 200, body: { paste: this.pastes[index] } };
    }
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const [deleted] = this.pastes.splice(index, 1);
    return { status: 200, body: { message: "Paste deleted successfully.", paste: deleted } };
  }

  private listPastes(username: string, query: URLSearchParams) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const owned = this.pastes.filter((paste) => paste.addedBy === username);
    const sorted = sortOrder === "asc" ? owned : [...owned].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted
          .slice((page - 1) * limit, page * limit)
          .map((paste) => ({ ...paste, addedBy: { _id: "u1", username } })),
        pagination: {
          limit,
          page,
          total: owned.length,
          pages: Math.ceil(owned.length / limit),
          sortBy: "addedOn",
          sortOrder
        }
      }
    };
  }
}

export const test = base.extend<{ api: MockApi }>({
  api: [
    async ({ page, baseURL }, use) => {
      const appOrigin = new URL(baseURL!).origin;
      const api = new MockApi();
      await page.route(
        (url) => url.origin !== appOrigin,
        (route) => api.handle(route, appOrigin)
      );

      await use(api);

      expect(api.unhandled, "requests the e2e API mock does not handle").toEqual([]);
    },
    // Auto: every test gets the mock, even one that never touches `api` directly.
    { auto: true }
  ]
});

export { expect };
