import type { Download, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { expect, MOCK_EMAIL, MOCK_PASSWORD, SHAREX_TOKEN_PLACEHOLDER, test } from "./fixtures";

const FILES = ["vb2007-upload.sxcu", "vb2007-paste.sxcu", "vb2007-shorten.sxcu"];

/** Each of `count` downloads that start from now, as its file name and its JSON. */
const downloads = (page: Page, count: number) => {
  const all = new Promise<Download[]>((resolve) => {
    const seen: Download[] = [];
    page.on("download", (download) => {
      seen.push(download);
      if (seen.length === count) resolve(seen);
    });
  });
  return async () =>
    Promise.all(
      (await all).map(async (download) => ({
        name: download.suggestedFilename(),
        text: await readFile((await download.path())!, "utf8")
      }))
    );
};

test("ShareX is set up from the account page: one key, three files with its token", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto("/account");
  await page.getByRole("link", { name: "Set up ShareX" }).click();
  await expect(page).toHaveURL("/account/sharex");
  await expect(page).toHaveTitle("ShareX · vb2007.hu");

  await page.getByRole("button", { name: "Set up ShareX" }).click();
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("The provided password is incorrect.")).toBeVisible();
  expect(api.apiKeysOf()).toHaveLength(0);

  const files = downloads(page, 3);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  const panel = page.getByRole("region", { name: "Your new API key" });
  await expect(panel.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  await expect(panel).toContainText("it won't be shown again");
  const token = (await panel.locator(".token__text").textContent())!;
  const [key] = api.apiKeysOf();
  expect(api.apiKeyTokenOf(key.id)).toBe(token);
  expect(key.name).toBe("ShareX");
  expect(key.scopes).toEqual(["uploads:write", "pastes:write", "shortUrls:write"]);

  const saved = await files();
  expect(saved.map(({ name }) => name).sort()).toEqual([...FILES].sort());
  for (const { text } of saved) {
    expect(JSON.parse(text).Headers).toEqual({ Authorization: `Bearer ${token}` });
    expect(text).not.toContain(SHAREX_TOKEN_PLACEHOLDER);
  }
  // The same files again, for a browser that held some back.
  await expect(page.getByRole("list", { name: "Your ShareX files" }).getByRole("link")).toHaveText(
    FILES
  );
  expect(page.url()).not.toContain(token);

  await panel.getByRole("button", { name: "I've saved the files" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Set up ShareX" })).toBeFocused();
});

test("a file that fails to load costs no key", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.sharexFileFails("paste");
  await page.goto("/account/sharex");
  await page.getByRole("button", { name: "Set up ShareX" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("Internal server error.")).toBeVisible();
  expect(api.apiKeysOf()).toHaveLength(0);
});

test("an account without a password confirms with GitHub and comes back to ShareX", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { password: false });
  await page.goto("/account/sharex");
  await page.getByRole("button", { name: "Set up ShareX" }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/^Confirm it's you first: log in with GitHub again/)).toBeVisible();
  expect(api.apiKeysOf()).toHaveLength(0);

  await page.getByRole("link", { name: "Confirm with GitHub" }).click();
  await expect(page).toHaveURL("/account/sharex");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set up ShareX within 10 minutes."
  );
  const files = downloads(page, 3);
  await page.getByRole("button", { name: "Set up ShareX" }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  expect(await files()).toHaveLength(3);
  expect(api.apiKeysOf()).toHaveLength(1);
});

test("at 10 keys the cap points to the API keys page", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  for (let i = 1; i <= 10; i++) api.hasApiKey(`Key ${i}`);
  await page.goto("/account/sharex");
  await page.getByRole("button", { name: "Set up ShareX" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(
    page.getByText(
      "You have 10 API keys, the most an account can have: delete one to create another."
    )
  ).toBeFocused();
  expect(api.apiKeysOf()).toHaveLength(10);
  await page.getByRole("link", { name: "Manage API keys" }).click();
  await expect(page).toHaveURL("/account/api-keys");
});

test("a visitor is asked to log in", async ({ page }) => {
  await page.goto("/account/sharex");
  await expect(page.getByText("Log in to set up ShareX.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
});
