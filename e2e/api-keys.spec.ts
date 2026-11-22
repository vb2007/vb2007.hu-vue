import { expect, MOCK_EMAIL, MOCK_PASSWORD, test } from "./fixtures";

const TOKEN = /^vbk_[\w-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

test("an API key is created from the account page and its token shown once", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto("/account");
  await page.getByRole("link", { name: "Manage API keys" }).click();
  await expect(page).toHaveURL(/\/account\/api-keys$/);
  await expect(page).toHaveTitle("API keys · vb2007.hu");
  await expect(page.getByText("No API keys yet.")).toBeVisible();

  await page.getByRole("button", { name: "Create an API key" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toBeFocused();
  await page.getByLabel("Name", { exact: true }).fill("Deploy bot");
  // Not the superuser: no admin scopes on offer.
  await expect(page.getByRole("group", { name: "Admin" })).toHaveCount(0);
  await page.getByRole("group", { name: "Pastes" }).getByLabel("Write").check({ force: true });
  await page.getByRole("group", { name: "Pastes" }).getByLabel("Read").check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("The provided password is incorrect.")).toBeVisible();
  expect(api.apiKeysOf()).toHaveLength(0);

  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  const panel = page.getByRole("region", { name: "Your new API key" });
  await expect(panel.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  await expect(panel).toContainText("it won't be shown again");
  const token = (await panel.locator(".token__text").textContent())!;
  expect(token).toMatch(TOKEN);
  const [created] = api.apiKeysOf();
  expect(api.apiKeyTokenOf(created.id)).toBe(token);
  expect(created.hint).toBe(token.slice(-4));
  expect(created.scopes).toEqual(["pastes:read", "pastes:write"]);
  expect(Date.parse(created.expiresAt!) - Date.parse(created.createdAt)).toBe(90 * DAY_MS);
  await expect(panel.locator(".token__usage")).toHaveText(
    /^curl -H "Authorization: Bearer vbk_…" https?:\/\/.+\/user$/
  );

  const list = page.getByRole("list", { name: "Your API keys" });
  await expect(list.getByRole("heading", { name: "Deploy bot" })).toBeVisible();
  await expect(list).toContainText(`…${token.slice(-4)}`);
  await expect(list).toContainText("Never used");

  await panel.getByRole("button", { name: "I've saved it" }).click();
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create an API key" })).toBeFocused();
  await expect(page.getByText(token)).toHaveCount(0);
  expect(page.url()).not.toContain(token);
});

test("rotating keeps the key's lifetime unless a new one is picked", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const old = api.hasApiKey("Script", { expiresInDays: 30, expired: true });
  const oldToken = api.apiKeyTokenOf(old.id);
  await page.goto("/account/api-keys");
  const list = page.getByRole("list", { name: "Your API keys" });
  await expect(list).toContainText("Expired");

  await list.getByRole("button", { name: "Rotate Script" }).click();
  await expect(list).toContainText("It expires 30 days from now again.");
  await list.getByRole("button", { name: "Continue" }).click();
  await list.getByLabel("Password").fill(MOCK_PASSWORD);
  await list.getByRole("button", { name: "Rotate key" }).click();
  const panel = page.getByRole("region", { name: "New token for Script" });
  await expect(panel).toContainText("the old token no longer works");
  const [rotated] = api.apiKeysOf();
  expect(rotated.id).toBe(old.id);
  expect(api.apiKeyTokenOf(rotated.id)).not.toBe(oldToken);
  await expect(panel.locator(".token__text")).toHaveText(api.apiKeyTokenOf(rotated.id)!);
  expect(Date.parse(rotated.expiresAt!) - Date.parse(rotated.createdAt)).toBe(30 * DAY_MS);
  await expect(list).not.toContainText("Expired");
  await panel.getByRole("button", { name: "I've saved it" }).click();

  await list.getByRole("button", { name: "Rotate Script" }).click();
  await list.getByLabel("New lifetime").selectOption("never");
  await list.getByRole("button", { name: "Continue" }).click();
  await list.getByLabel("Password").fill(MOCK_PASSWORD);
  await list.getByRole("button", { name: "Rotate key" }).click();
  await expect(panel).toBeVisible();
  expect(api.apiKeysOf()[0].expiresAt).toBeNull();
  await expect(list).toContainText("Never expires");
});

test("a key is deleted with two clicks, and one gone elsewhere is said so", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasApiKey("First");
  const second = api.hasApiKey("Second");
  await page.goto("/account/api-keys");
  const list = page.getByRole("list", { name: "Your API keys" });

  await list.getByRole("button", { name: "Delete First" }).click();
  await list.getByRole("button", { name: "Confirm delete First" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "API key deleted successfully." })
  ).toBeFocused();
  await expect(list.getByRole("heading", { name: "First" })).toHaveCount(0);

  api.apiKeysOf().splice(api.apiKeysOf().indexOf(second), 1);
  await list.getByRole("button", { name: "Rotate Second" }).click();
  await list.getByRole("button", { name: "Continue" }).click();
  await list.getByLabel("Password").fill(MOCK_PASSWORD);
  await list.getByRole("button", { name: "Rotate key" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "There is no such API key on this account." })
  ).toBeFocused();
  await expect(page.getByText("No API keys yet.")).toBeVisible();
});

test("the cap and the used-up security notices hold creating back", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  for (let i = 1; i <= 10; i++) api.hasApiKey(`Key ${i}`);
  await page.goto("/account/api-keys");
  await expect(
    page.getByText(
      "You have 10 API keys, the most an account can have: delete one to create another."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an API key" })).toHaveCount(0);

  api.usesUpSecurityNotices();
  const list = page.getByRole("list", { name: "Your API keys" });
  await list.getByRole("button", { name: "Delete Key 1", exact: true }).click();
  await list.getByRole("button", { name: "Confirm delete Key 1", exact: true }).click();
  await page.getByRole("button", { name: "Create an API key" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Eleventh");
  await page.getByRole("group", { name: "Uploads" }).getByLabel("Read").check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText(/Too many security notices were mailed/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Try again in/ })).toBeDisabled();
  expect(api.apiKeysOf()).toHaveLength(9);
});

test("an account without a password confirms with GitHub and comes back to its API keys", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { password: false });
  await page.goto("/account/api-keys");
  const fillIn = async () => {
    await page.getByRole("button", { name: "Create an API key" }).click();
    await page.getByLabel("Name", { exact: true }).fill("Deploy bot");
    await page.getByRole("group", { name: "Pastes" }).getByLabel("Read").check({ force: true });
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create key" }).click();
  };
  await fillIn();
  await expect(page.getByText(/^Confirm it's you first: log in with GitHub again/)).toBeVisible();

  await page.getByRole("link", { name: "Confirm with GitHub" }).click();
  await expect(page).toHaveURL("/account/api-keys");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Create or rotate the API key within 10 minutes."
  );
  await fillIn();
  await expect(page.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  expect(api.apiKeysOf()).toHaveLength(1);

  // A later relink from the account page itself stays there.
  await page.goto("/account?github=linked");
  await expect(page).toHaveURL("/account");
});

test("a field the form sends the cursor to scrolls clear of the navbar", async ({ page, api }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  api.loggedInAs(MOCK_EMAIL, "e2e");
  for (let i = 1; i <= 6; i++) api.hasApiKey(`Key ${i}`);
  await page.goto("/account/api-keys");
  await page.getByRole("button", { name: "Create an API key" }).click();
  await page.getByLabel("Days from now").scrollIntoViewIfNeeded();
  await page.evaluate("window.scrollTo(0, document.documentElement.scrollHeight)");
  await page.getByLabel("Days from now").press("Enter");

  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toBeFocused();
  const navBottom = (await page.getByRole("banner").boundingBox())!;
  await expect
    .poll(async () => (await name.boundingBox())!.y)
    .toBeGreaterThanOrEqual(navBottom.y + navBottom.height);
});

test("a visitor is asked to log in", async ({ page }) => {
  await page.goto("/account/api-keys");
  await expect(page.getByText("Log in to manage your API keys.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
});
