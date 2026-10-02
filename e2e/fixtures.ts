import { test as base, expect, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`)
 * before navigating. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one.
 *
 * Requests this mock doesn't know are aborted and fail the test at teardown, so e2e runs can
 * never reach a real server. Add a case to `respond` when the app starts calling a new endpoint.
 */
export class MockApi {
  private user: { email: string } | null = null;
  private shortCode = "e2e123";
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  loggedInAs(email = "e2e@example.com") {
    this.user = { email };
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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    const { pathname } = new URL(request.url());
    const response = this.respond(`${request.method()} ${pathname}`, request.postDataJSON());
    if (!response) {
      this.unhandled.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    return route.fulfill({ status: response.status, headers, json: response.body ?? {} });
  }

  private respond(endpoint: string, body: { email?: string } | null) {
    switch (endpoint) {
      case "GET /user":
        return this.user ? { status: 200, body: this.user } : { status: 401 };
      case "POST /auth/login":
        this.user = { email: body?.email ?? "e2e@example.com" };
        return { status: 200 };
      case "POST /auth/logout":
        this.user = null;
        return { status: 200 };
      case "POST /auth/register":
        return { status: 201 };
      case "POST /shortenUrl/create":
        return { status: 200, body: { data: { shortenedUrl: this.shortCode } } };
      default:
        return undefined;
    }
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
