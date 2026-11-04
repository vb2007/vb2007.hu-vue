import { expect, test } from "./fixtures";

test("an unknown path shows the not-found board with a way home", async ({ page }) => {
  await page.goto("/no/such/page");

  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("main").getByText("/no/such/page", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome home" })).toBeVisible();
});

test("the not-found board leads to the open tools only", async ({ page }) => {
  await page.goto("/no/such/page");
  const tools = page.getByRole("region", { name: "Tools" });

  await expect(tools.getByText("Planned", { exact: true })).toHaveCount(0);
  await tools.getByRole("link", { name: /^Upload Upload and share files/ }).click();
  await expect(page).toHaveURL("/upload");
  await expect(page.getByRole("heading", { level: 1, name: "Upload" })).toBeVisible();
});
