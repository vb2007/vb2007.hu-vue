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
