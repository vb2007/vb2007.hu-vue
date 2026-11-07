import type { Page } from "@playwright/test";
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

test.describe("your links on /shorten", () => {
  /** The "Your links" board. */
  const yourLinks = (page: Page) =>
    page.locator(".board").filter({ has: page.getByRole("heading", { name: "Your links" }) });
  /** The codes the board lists, top to bottom. */
  const codes = (page: Page) => yourLinks(page).getByRole("listitem").getByRole("link");
  /** One row of the board, by its code. */
  const row = (page: Page, code: string) =>
    yourLinks(page)
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: code, exact: true }) });

  test("lists the user's own links, newest first, and a new one joins at the top", async ({
    page,
    context,
    api,
    baseURL
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    api.loggedInAs();
    api.hasShortLink("old111", TARGET);
    api.hasShortLink("theirs", "https://example.com/not-mine", "someone-else");
    api.shortenReturns("new222");
    await page.goto("/shorten");
    const board = yourLinks(page);

    await expect(board.getByText("1 link", { exact: true })).toBeVisible();
    await expect(row(page, "old111")).toContainText("target.e2e.invalid/landing");
    await expect(codes(page)).toHaveText(["old111"]);

    // A search the new link doesn't match goes, so the link shows.
    await board.getByLabel("Search by code or target").fill("old");
    await expect(board.getByText("1 link found")).toBeVisible();
    await page.getByLabel("URL").fill("https://example.com/fresh");
    await page.getByRole("button", { name: "Shorten", exact: true }).click();

    await expect(board.getByText("2 links", { exact: true })).toBeVisible();
    await expect(codes(page)).toHaveText(["new222", "old111"]);
    await expect(board.getByLabel("Search by code or target")).toHaveValue("");

    await row(page, "old111").getByRole("button", { name: "Copy link old111" }).click();
    await expect(row(page, "old111").getByRole("button", { name: "Copied old111" })).toBeVisible();
    expect(await page.evaluate("navigator.clipboard.readText()")).toBe(`${baseURL}/r/old111`);

    await row(page, "old111").getByRole("link", { name: "old111" }).click();
    await expect(page).toHaveURL("/r/old111/preview");
  });

  test("search matches the code or the target", async ({ page, api }) => {
    api.loggedInAs();
    api.hasShortLink("abc123", TARGET);
    api.hasShortLink("xyz789", "https://example.com/other");
    await page.goto("/shorten");
    const board = yourLinks(page);
    const search = board.getByLabel("Search by code or target");
    await expect(codes(page)).toHaveText(["xyz789", "abc123"]);

    await search.fill("LANDING");
    await expect(codes(page)).toHaveText(["abc123"]);
    await expect(board.getByText("1 link found")).toBeVisible();

    await search.fill("xyz");
    await expect(codes(page)).toHaveText(["xyz789"]);

    await search.fill("nowhere");
    await expect(board.getByText(/^No links match\./)).toBeVisible();
    await board.getByRole("button", { name: "Show all links" }).click();
    await expect(codes(page)).toHaveText(["xyz789", "abc123"]);
    await expect(search).toHaveValue("");
  });

  test("deleting takes a second click, and emptying the last page steps back one", async ({
    page,
    api
  }) => {
    api.loggedInAs();
    for (let n = 0; n <= 10; n++) api.hasShortLink(`code${n}`, `https://example.com/${n}`);
    await page.goto("/shorten");
    const board = yourLinks(page);
    await expect(board.getByText("Page 1 of 2")).toBeVisible();

    await board.getByRole("button", { name: "Next" }).click();
    await expect(board.getByText("Page 2 of 2")).toBeVisible();
    await expect(codes(page)).toHaveText(["code0"]);

    await row(page, "code0").getByRole("button", { name: "Delete code0" }).click();
    await expect(
      row(page, "code0").getByRole("button", { name: "Confirm delete code0" })
    ).toBeVisible();
    expect(api.shortLinks.has("code0")).toBe(true);
    await row(page, "code0").getByRole("button", { name: "Confirm delete code0" }).click();

    await expect(board.getByText("10 links", { exact: true })).toBeVisible();
    await expect(codes(page)).toHaveCount(10);
    await expect(codes(page).first()).toHaveText("code10");
    await expect(board.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
    expect(api.shortLinks.has("code0")).toBe(false);
    // The focused key went with its row: focus goes to the first row's, and the delete is announced.
    await expect(row(page, "code10").getByRole("button", { name: "Delete code10" })).toBeFocused();
    await expect(board.getByRole("status")).toHaveText("Deleted code0.");
  });

  test("a link deleted elsewhere drops out with the API's text", async ({ page, api }) => {
    api.loggedInAs();
    api.hasShortLink("gone11", TARGET);
    api.hasShortLink("kept22", "https://example.com/kept");
    await page.goto("/shorten");
    const board = yourLinks(page);

    await row(page, "gone11").getByRole("button", { name: "Delete gone11" }).click();
    api.shortLinks.delete("gone11");
    await row(page, "gone11").getByRole("button", { name: "Confirm delete gone11" }).click();

    await expect(board.getByRole("alert")).toHaveText("gone11: The shortened URL cannot be found.");
    await expect(codes(page)).toHaveText(["kept22"]);
    await expect(row(page, "kept22").getByRole("button", { name: "Delete kept22" })).toBeFocused();
  });

  test("logged out, there is no list", async ({ page }) => {
    await page.goto("/shorten");

    await expect(page.getByText("Create a new account")).toBeVisible();
    await expect(yourLinks(page)).toHaveCount(0);
  });
});
