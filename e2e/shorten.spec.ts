import { expect, test } from "./fixtures";

test("a user logs in and shortens a link", async ({ page, api }) => {
  api.shortenReturns("abc123");
  await page.goto("/login");

  await page.getByLabel("E-mail").fill("e2e@example.com");
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();

  await page.getByRole("link", { name: "Go to Shorten" }).click();
  await page.getByLabel("URL").fill("https://example.com/a/very/long/path");
  await page.getByRole("button", { name: "Shorten", exact: true }).click();

  const shortLink = page.getByRole("link", { name: /\/r\/abc123$/ });
  await expect(shortLink).toBeVisible();

  await page.getByRole("button", { name: "Shorten another" }).click();
  await expect(shortLink).toBeHidden();
  await expect(page.getByLabel("URL")).toHaveValue("");
});

test("an already logged-in user goes straight to the form", async ({ page, api }) => {
  api.loggedInAs("someone@example.com");
  await page.goto("/shorten");

  await expect(page.getByLabel("URL")).toBeVisible();
});
