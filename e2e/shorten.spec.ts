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

test("a URL over 2000 characters is refused before it's sent", async ({ page, api }) => {
  api.loggedInAs("someone@example.com");
  api.shortenReturns("abc123");
  const sent: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/shortenUrl/create") sent.push(request.url());
  });
  await page.goto("/shorten");
  const url = page.getByLabel("URL");
  const ofLength = (length: number) =>
    `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;

  await url.fill(ofLength(2001));
  await expect(url).toHaveAccessibleDescription("A URL can be at most 2000 characters.");
  await expect(url).toHaveValue(ofLength(2001));
  await expect(page.getByRole("button", { name: "Shorten", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  await url.press("Enter");
  await expect(url).toHaveAccessibleDescription("A URL can be at most 2000 characters.");
  expect(sent).toEqual([]);

  await url.fill(ofLength(2000));
  await expect(url).not.toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Shorten", exact: true }).click();
  await expect(page.getByRole("link", { name: /\/r\/abc123$/ })).toBeVisible();
  expect(sent).toHaveLength(1);
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
