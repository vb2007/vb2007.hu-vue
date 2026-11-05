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

test("shortening a URL again gives back the user's own link", async ({ page, api }) => {
  const target = "https://example.com/shared";
  // Someone else's link to the same URL doesn't count.
  api.hasShortLink("xyz789", target, "someone-else");
  api.loggedInAs();
  api.shortenReturns("abc123");
  await page.goto("/shorten");
  const shorten = async (url: string) => {
    await page.getByLabel("URL").fill(url);
    await page.getByRole("button", { name: "Shorten", exact: true }).click();
  };

  await shorten(target);
  await expect(page.getByRole("link", { name: /\/r\/abc123$/ })).toBeVisible();

  await page.getByRole("button", { name: "Shorten another" }).click();
  api.shortenReturns("def456");
  await shorten(target);
  await expect(page.getByRole("link", { name: /\/r\/abc123$/ })).toBeVisible();

  await page.getByRole("button", { name: "Shorten another" }).click();
  await shorten("https://example.com/other");
  await expect(page.getByRole("link", { name: /\/r\/def456$/ })).toBeVisible();
});

test("an already logged-in user goes straight to the form", async ({ page, api }) => {
  api.loggedInAs("someone@example.com");
  await page.goto("/shorten");

  await expect(page.getByLabel("URL")).toBeVisible();
});

test("the URL is checked once it's left", async ({ page, api }) => {
  api.loggedInAs("someone@example.com");
  await page.goto("/shorten");
  const url = page.getByLabel("URL");

  await url.fill("example.com");
  await page.keyboard.press("Tab");
  await expect(url).toHaveAccessibleDescription("Invalid URL / URI format.");

  await url.fill("https://example.com");
  await expect(url).not.toHaveAttribute("aria-invalid", "true");
});

test("a URL the API refuses shows its reason", async ({ page, api }) => {
  api.loggedInAs();
  await page.goto("/shorten");
  const url = page.getByLabel("URL");

  // The form lets whitespace through; the API doesn't.
  await url.fill("https://example.com/a b");
  await page.getByRole("button", { name: "Shorten", exact: true }).click();

  await expect(url).toHaveAccessibleDescription("The URI/URL you've provided isn't valid.");
  await expect(url).toHaveValue("https://example.com/a b");
  expect(api.shortLinks.size).toBe(0);
});
