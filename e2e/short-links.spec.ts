import { expect, test } from "./fixtures";

const TARGET = "https://target.e2e.invalid/landing";

test.beforeEach(async ({ page }) => {
  // Stand-in for the short link's destination; registered after the API mock, so it wins.
  await page.route("https://target.e2e.invalid/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Landed</h1>" })
  );
});

test("a new short link lives on the site and leads to its target", async ({
  page,
  api,
  baseURL
}) => {
  api.loggedInAs();
  api.shortenReturns("abc123");
  await page.goto("/shorten");

  await page.getByLabel("URL").fill(TARGET);
  await page.getByRole("button", { name: "Shorten", exact: true }).click();

  // CI serves on a port of its own (E2E_PORT), so the link is built from the base URL.
  const link = `${baseURL}/r/abc123`;
  const shortLink = page.getByRole("link", { name: link.replace(/^https?:\/\//, "") });
  await expect(shortLink).toHaveAttribute("href", link);

  await page.goto("/r/abc123");
  await expect(page).toHaveURL(TARGET);
  await expect(page.getByRole("heading", { name: "Landed" })).toBeVisible();
});

test("a preview shows where a link leads and who shared it, without going there", async ({
  page,
  api
}) => {
  api.hasShortLink("gh1", TARGET, "test");

  await page.goto("/r/gh1/preview");

  await expect(page.getByRole("heading", { level: 1, name: "Short link" })).toBeVisible();
  await expect(page.getByText("target.e2e.invalid", { exact: true })).toBeVisible();
  await expect(page.getByText("test", { exact: true })).toBeVisible();
  await expect(page.getByText("example.com")).toHaveCount(0);
  await expect(page).toHaveURL("/r/gh1/preview");

  await page.getByRole("link", { name: "Continue to target.e2e.invalid" }).click();
  await expect(page).toHaveURL(TARGET);
});

test("an unknown short link explains itself", async ({ page }) => {
  await page.goto("/r/missing");

  await expect(page.getByRole("alert")).toHaveText("The shortened URL cannot be found.");
  await page.getByRole("link", { name: "Shorten a link" }).click();
  await expect(page).toHaveURL("/shorten");
});

test("falls back to the API's redirect when the lookup answers without JSON", async ({
  page,
  api,
  baseURL
}) => {
  // Playwright only routes the first request of a redirect chain (see `page.route`), so the API's
  // 302 must lead to a host that really answers: the preview server, not the routed TARGET. Some
  // Chromium builds route the second hop anyway, but Playwright's headless shell doesn't.
  const target = `${baseURL}/shorten`;
  api.hasShortLink("old123", target);
  const viaApi = page.waitForRequest(
    (request) =>
      request.isNavigationRequest() &&
      !request.url().startsWith(baseURL!) &&
      new URL(request.url()).pathname === "/r/old123"
  );
  // An HTML 404 from something in front of the API, not the API's own JSON answer.
  await page.route("**/shortenUrl/old123", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "<h1>404 Not Found</h1>"
    })
  );

  await page.goto("/r/old123");

  await viaApi;
  await expect(page).toHaveURL(target);
});

test("a server error on the lookup shows the API's message and can be retried", async ({
  page,
  api
}) => {
  api.hasShortLink("flaky1", TARGET);
  // The API's JSON 500 once, then the mock's own answer.
  let failed = false;
  await page.route("**/shortenUrl/flaky1", (route) => {
    if (failed) return route.fallback();
    failed = true;
    return route.fulfill({
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*" },
      json: { error: "Something went wrong on the server: please try again later." }
    });
  });

  await page.goto("/r/flaky1");

  await expect(page.getByRole("alert")).toHaveText(
    "Something went wrong on the server: please try again later."
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page).toHaveURL(TARGET);
});
