import { expect, test } from "./fixtures";

const TARGET = "https://target.e2e.invalid/landing";

test.beforeEach(async ({ page }) => {
  // Stand-in for the short link's destination; registered after the API mock, so it wins.
  await page.route("https://target.e2e.invalid/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Landed</h1>" })
  );
});

test("a new short link lives on the site and leads to its target", async ({ page, api }) => {
  api.loggedInAs();
  api.shortenReturns("abc123");
  await page.goto("/shorten");

  await page.getByLabel("URL").fill(TARGET);
  await page.getByRole("button", { name: "Shorten", exact: true }).click();

  const shortLink = page.getByRole("link", { name: "localhost:4173/r/abc123" });
  await expect(shortLink).toHaveAttribute("href", "http://localhost:4173/r/abc123");

  await page.goto("/r/abc123");
  await expect(page).toHaveURL(TARGET);
  await expect(page.getByRole("heading", { name: "Landed" })).toBeVisible();
});

test("an unknown short link explains itself", async ({ page }) => {
  await page.goto("/r/missing");

  await expect(page.getByRole("alert")).toHaveText("The shortened URL cannot be found.");
  await page.getByRole("link", { name: "Shorten a link" }).click();
  await expect(page).toHaveURL("/shorten");
});

test("falls back to the API's redirect when the lookup endpoint isn't deployed", async ({
  page,
  api
}) => {
  api.hasShortLink("old123", TARGET);
  // What an API without the lookup endpoint answers: Express's default HTML 404.
  await page.route("**/shortenUrl/old123", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/html",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: "<pre>Cannot GET /shortenUrl/old123</pre>"
    })
  );

  await page.goto("/r/old123");

  await expect(page).toHaveURL(TARGET);
});
