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

test("the API error page leads to the open tools", async ({ page }) => {
  await page.goto(apiErrorPage);
  const tools = page.getByRole("region", { name: "Tools" });

  await expect(tools.getByText("Planned", { exact: true })).toHaveCount(0);
  await tools.getByRole("link", { name: /^Shorten/ }).click();
  await expect(page).toHaveURL("/shorten");
});

test("the API error page without an address still reads", async ({ page }) => {
  await page.goto("/apierror");

  await expect(page.getByRole("heading", { level: 1, name: "API route not found" })).toBeVisible();
  await expect(
    page.getByText("The API has no route at the address you opened.", { exact: false })
  ).toBeVisible();
});
