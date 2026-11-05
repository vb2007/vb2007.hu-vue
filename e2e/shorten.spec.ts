import { expect, MOCK_EMAIL, MOCK_PASSWORD, test } from "./fixtures";

test("a user logs in and shortens a link", async ({ page, api }) => {
  api.shortenReturns("abc123");
  await page.goto("/login");

  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
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

  // Numbers are written the browser's way, e.g. "2,430".
  const [length, limit] = await page.evaluate(() =>
    [2430, 2000].map((value) => value.toLocaleString())
  );
  const tooLong = `This URL is ${length} characters; the limit is ${limit}.`;

  await url.fill(ofLength(2430));
  await expect(url).toHaveAccessibleDescription(tooLong);
  await expect(url).toHaveValue(ofLength(2430));
  await expect(page.getByRole("button", { name: "Shorten", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  await url.press("Enter");
  await expect(url).toHaveAccessibleDescription(tooLong);
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
