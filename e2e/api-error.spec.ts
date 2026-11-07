import { expect, test } from "./fixtures";

// Where the API sends a browser that opens a route it doesn't have (vb2007/vb2007.hu-api#305).
const apiErrorPage = "/apierror?url=%2Ffoo%3Fx%3D1";

test("the API's unknown-route redirect names the address with a way home", async ({ page }) => {
  await page.goto(apiErrorPage);

  await expect(page.getByRole("heading", { level: 1, name: "API route not found" })).toBeVisible();
  const address = page.getByRole("main").locator("code");
  await expect(address).toHaveText(/^[^/]+\/foo\?x=1$/);
  await expect(page.getByRole("main").getByRole("link", { name: /foo/ })).toHaveCount(0);

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome home" })).toBeVisible();
});

test("the API error page has its own title and stays out of search results", async ({ page }) => {
  await page.goto(apiErrorPage);
  const robots = page.locator('head meta[name="robots"]');

  await expect(page).toHaveTitle("API route not found · vb2007.hu");
  await expect(robots).toHaveCount(1);
  await expect(robots).toHaveAttribute("content", "noindex");

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page).toHaveTitle("vb2007.hu");
  await expect(robots).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(apiErrorPage);
  await expect(page).toHaveTitle("API route not found · vb2007.hu");
  await expect(robots).toHaveCount(1);
  await expect(robots).toHaveAttribute("content", "noindex");
});

test("the API error page leads to the open tools", async ({ page }) => {
  await page.goto(apiErrorPage);
  const tools = page.getByRole("region", { name: "Tools" });

  await expect(tools.getByText("Planned", { exact: true })).toHaveCount(0);
  await tools.getByRole("link", { name: /^Shorten/ }).click();
  await expect(page).toHaveURL("/shorten");
});

test("a bidi override in the address stays escaped and can't reorder the sentence", async ({
  page
}) => {
  // What the API sends for /docs/%E2%80%AEfdp.exe: a right-to-left override before "fdp.exe".
  await page.goto("/apierror?url=%2Fdocs%2F%25E2%2580%25AEfdp.exe");

  await expect(page.getByRole("main").locator("code")).toHaveText(/\/docs\/%E2%80%AEfdp\.exe$/);
  await expect(page.getByRole("main").locator("code")).toHaveCSS("unicode-bidi", "isolate");
});

test("a made-up sentence in the address reads as an escaped address", async ({ page }) => {
  await page.goto(
    "/apierror?url=%2F%250A%250AYour%2520session%2520expired.%2520Log%2520in%2520again%2520at%2520vb2007-login.example"
  );

  await expect(page.getByRole("main").locator("code")).toHaveText(
    /\/%0A%0AYour%20session%20expired\.%20Log%20in%20again%20at%20vb2007-login\.example$/
  );
});

test("the API error page without an address still reads", async ({ page }) => {
  await page.goto("/apierror");

  await expect(page.getByRole("heading", { level: 1, name: "API route not found" })).toBeVisible();
  await expect(
    page.getByText("The API has no route at the address you opened.", { exact: false })
  ).toBeVisible();
});
