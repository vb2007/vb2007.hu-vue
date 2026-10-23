import { expect, test } from "./fixtures";

test("a user creates, opens, lists and deletes a paste", async ({ page, api, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  api.loggedInAs();
  await page.goto("/pastebin");

  await expect(page.getByText("No pastes yet.")).toBeVisible();

  await page.getByLabel("Text").fill("console.log('hello');\nsecond line");
  await page.getByRole("button", { name: "Create paste" }).click();

  const pasteLink = page.getByRole("link", { name: /\/pastebin\/0+1$/ });
  await expect(pasteLink).toBeVisible();
  await expect(page.getByLabel("Text")).toHaveValue("");
  await expect(page.getByText("1 paste", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "console.log('hello');" }).click();
  await expect(page).toHaveURL(/\/pastebin\/0+1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Paste" })).toBeVisible();
  await expect(page.getByLabel("Paste content")).toHaveText("console.log('hello');\nsecond line");

  await page.getByRole("button", { name: "Copy text" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe(
    "console.log('hello');\nsecond line"
  );

  await page.getByRole("link", { name: "New paste" }).click();
  await expect(page).toHaveURL("/pastebin");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("No pastes yet.")).toBeVisible();
  expect(api.pastes).toEqual([]);
});

test("the list pages through pastes and flips the sort order", async ({ page, api }) => {
  api.loggedInAs();
  for (let i = 1; i <= 12; i++) api.hasPaste(`paste number ${i}`);
  api.hasPaste("someone else's paste", "other");
  await page.goto("/pastebin");

  const previews = page.locator(".paste__preview");
  await expect(page.getByText("12 pastes")).toBeVisible();
  await expect(previews).toHaveCount(10);
  await expect(previews.first()).toHaveText("paste number 12");
  await expect(page.getByText("Page 1 of 2")).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  await expect(previews).toHaveText(["paste number 2", "paste number 1"]);

  await page.getByRole("button", { name: "Sort: Newest first" }).click();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await expect(previews.first()).toHaveText("paste number 1");
});

test("logged-out visitors can read a shared paste but not create one", async ({ page, api }) => {
  const paste = api.hasPaste("shared with the world");
  await page.goto(`/pastebin/${paste._id}`);

  await expect(page.getByLabel("Paste content")).toHaveText("shared with the world");

  await page.getByRole("link", { name: "New paste" }).click();
  await expect(page.getByText("Only logged-in users can create pastes")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your pastes" })).toBeHidden();
});

test("a missing or malformed paste link explains itself", async ({ page }) => {
  await page.goto(`/pastebin/${"f".repeat(24)}`);
  await expect(page.getByRole("alert")).toHaveText("There is no such paste with that ID.");

  await page.goto("/pastebin/not-an-id");
  await expect(page.getByRole("alert")).toHaveText("That isn't a valid paste link.");
});

test("pasting code picks its language, and the paste page highlights it", async ({ page, api }) => {
  api.loggedInAs();
  await page.goto("/pastebin");

  const language = page.getByLabel("Language");
  await expect(language.locator("option").first()).toHaveText("Auto");
  await page.getByLabel("Text").fill("def greet(name):\n    print(f'Hello, {name}')");
  await expect(language.locator("option").first()).toHaveText("Auto: Python");
  await page.getByRole("button", { name: "Create paste" }).click();

  await expect(page.getByLabel("Text")).toHaveValue("");
  expect(api.pastes[0].language).toBe("python");
  await expect(language).toHaveValue("auto");
  await expect(page.locator(".paste__meta")).toContainText("Python");

  await page.getByRole("link", { name: "def greet(name):" }).click();
  const content = page.getByLabel("Paste content");
  await expect(content.locator(".hljs-keyword").first()).toHaveText("def");
  await expect(content).toHaveText("def greet(name):\n    print(f'Hello, {name}')");
});

test("the composer sends a language the user picked over the detected one", async ({
  page,
  api
}) => {
  api.loggedInAs();
  await page.goto("/pastebin");

  await page.getByLabel("Text").fill("SELECT name FROM users;");
  await expect(page.getByLabel("Language").locator("option").first()).toHaveText("Auto: SQL");
  await page.getByLabel("Language").selectOption("plaintext");
  await page.getByRole("button", { name: "Create paste" }).click();

  await expect(page.getByLabel("Text")).toHaveValue("");
  expect(api.pastes[0].language).toBe("plaintext");
});

test("a Markdown paste renders, with its source a click away", async ({ page, api }) => {
  const paste = api.hasPaste(
    "# Notes\n\nSee [the docs](https://example.com) and <script>alert(1)</script>",
    "e2e",
    "markdown"
  );
  await page.goto(`/pastebin/${paste._id}`);

  const content = page.getByLabel("Paste content");
  await expect(content.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(content.getByRole("link", { name: "the docs" })).toHaveAttribute(
    "rel",
    "nofollow noopener noreferrer"
  );
  await expect(content).toContainText("<script>alert(1)</script>");

  await page.getByText("Source", { exact: true }).click();
  await expect(content).toHaveText(
    "# Notes\n\nSee [the docs](https://example.com) and <script>alert(1)</script>"
  );
  await expect(page.getByRole("button", { name: /^Line numbers/ })).toBeVisible();
});

test("the owner changes a paste's language; others can't", async ({ page, api }) => {
  const own = api.hasPaste("just some words", "e2e", "plaintext");
  const theirs = api.hasPaste("someone else's words", "other", "plaintext");
  api.loggedInAs();

  await page.goto(`/pastebin/${own._id}`);
  await page.getByLabel("Language").selectOption("markdown");
  await expect(page.locator(".note__language")).toHaveText("Markdown");
  await expect(page.getByRole("status").filter({ hasText: "Language changed" })).toHaveText(
    "Language changed to Markdown"
  );
  expect(api.pastes[0].language).toBe("markdown");

  await page.goto(`/pastebin/${theirs._id}`);
  await expect(page.getByLabel("Paste content")).toHaveText("someone else's words");
  await expect(page.getByLabel("Language")).toHaveCount(0);
});
