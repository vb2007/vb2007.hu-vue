import { expect, test } from "./fixtures";

test("an unknown path shows the not-found board with a way home", async ({ page }) => {
  await page.goto("/no/such/page");

  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("main").getByText("/no/such/page", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome home" })).toBeVisible();
});

test("a bidi override in the path stays escaped and can't reorder the sentence", async ({
  page
}) => {
  await page.goto("/docs/%E2%80%AEfdp.exe");

  const path = page.getByRole("main").locator("code");
  await expect(path).toHaveText("/docs/%E2%80%AEfdp.exe");
  await expect(path).toHaveCSS("unicode-bidi", "isolate");
});

test("the not-found page has its own title and stays out of search results", async ({ page }) => {
  await page.goto("/no/such/page");
  const robots = page.locator('head meta[name="robots"]');

  await expect(page).toHaveTitle("Page not found · vb2007.hu");
  await expect(robots).toHaveCount(1);
  await expect(robots).toHaveAttribute("content", "noindex");

  // Back to home is a router link, so the tag goes in the router's afterEach, not with a page load.
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page).toHaveTitle("vb2007.hu");
  await expect(robots).toHaveCount(0);
});

test("the not-found board leads to the open tools only", async ({ page }) => {
  await page.goto("/no/such/page");
  const tools = page.getByRole("region", { name: "Tools" });

  await expect(tools.getByText("Planned", { exact: true })).toHaveCount(0);
  await tools.getByRole("link", { name: /^Upload Upload and share files/ }).click();
  await expect(page).toHaveURL("/upload");
  await expect(page.getByRole("heading", { level: 1, name: "Upload" })).toBeVisible();
});
