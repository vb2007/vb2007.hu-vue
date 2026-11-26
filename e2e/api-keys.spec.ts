import { expect, MOCK_EMAIL, MOCK_PASSWORD, test } from "./fixtures";

const TOKEN = /^vbk_[\w-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

test("a password change revokes the API keys only when its box is ticked", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasApiKey("Deploy bot");
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });
  const changePassword = async (current: string, next: string, revoke: boolean) => {
    await details.getByRole("button", { name: "Change password" }).click();
    const box = details.getByRole("checkbox", { name: "Also revoke my API keys" });
    await expect(box).not.toBeChecked();
    await expect(box).toHaveAccessibleDescription(
      "Deletes all of them, so scripts, ShareX and apps using one stop working. Do it if your password or a key may have leaked."
    );
    await details.getByLabel("Current password").fill(current);
    await details.getByLabel("New password", { exact: true }).fill(next);
    await details.getByLabel("Confirm new password").fill(next);
    // Only the box and its label tick it, not the blank space right of the label.
    const row = details.locator(".change__revoke");
    const { width } = (await row.boundingBox())!;
    await row.click({ position: { x: width - 4, y: 8 } });
    await expect(box).not.toBeChecked();
    if (revoke) await box.check({ force: true });
    await details.getByRole("button", { name: "Save password" }).click();
  };

  await changePassword(MOCK_PASSWORD, "a-new-password", false);
  await expect(details.getByRole("status")).toHaveText("Password changed successfully.");
  expect(api.apiKeysOf()).toHaveLength(1);

  await changePassword("a-new-password", "another-password", true);
  await expect(details.getByRole("status")).toHaveText(
    "Password changed successfully. Any API keys you had were revoked."
  );
  expect(api.apiKeysOf()).toHaveLength(0);

  // The list loads whenever its page opens, so it's empty from the start.
  await page.getByRole("link", { name: "Manage API keys" }).click();
  await expect(page.getByText("No API keys yet.")).toBeVisible();
});

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
  await page.getByRole("button", { name: "Create an API key" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Deploy bot");
  await page.getByRole("group", { name: "Pastes" }).getByLabel("Read").check({ force: true });
  const create = async () => {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Create key" }).click();
  };
  await create();
  await expect(page.getByText(/^Confirm it's you first: log in with GitHub again/)).toBeVisible();

  // The form comes back as it was left, through the deep link's query.
  await page.getByRole("link", { name: "Confirm with GitHub" }).click();
  await expect(page).toHaveURL(/\/account\/api-keys\?newApiKey=1&/);
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Create or rotate the API key within 10 minutes."
  );
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Deploy bot");
  await expect(page.getByRole("group", { name: "Pastes" }).getByLabel("Read")).toBeChecked();
  await create();
  await expect(page).toHaveURL("/account/api-keys");
  await expect(page.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  expect(api.apiKeysOf()).toHaveLength(1);

  // A later relink from the account page itself stays there.
  await page.goto("/account?github=linked");
  await expect(page).toHaveURL("/account");
});

test("a deep link fills in the create form, leaving out the scopes it can't give", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto(
    "/account?newApiKey=1&name=spotdl%20extension&scopes=uploads:write,admin:read,spotdl:submit"
  );
  await expect(page).toHaveURL(/\/account\/api-keys\?newApiKey=1&/);
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("spotdl extension");
  await expect(name).toBeFocused();
  await expect(page.getByRole("group", { name: "Uploads" }).getByLabel("Write")).toBeChecked();
  await expect(page.getByRole("group", { name: "Uploads" }).getByLabel("Read")).not.toBeChecked();
  await expect(page.getByRole("group", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "The link asked for scopes it can't set, so they're left out: admin:read, spotdl:submit."
  );
  await expect(page.getByLabel("Days from now")).toHaveValue("90");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  const [created] = api.apiKeysOf();
  expect(created.name).toBe("spotdl extension");
  expect(created.scopes).toEqual(["uploads:write"]);
  expect(Date.parse(created.expiresAt!) - Date.parse(created.createdAt)).toBe(90 * DAY_MS);
  await expect(page).toHaveURL("/account/api-keys");
});

test("a deep link's form comes back filled in from a GitHub confirmation", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { password: false });
  await page.goto("/account/api-keys?newApiKey=1&name=Deploy%20bot&scopes=pastes:read");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  await page.getByRole("link", { name: "Confirm with GitHub" }).click();

  await expect(
    page.getByRole("status").filter({
      hasText: "GitHub confirmed it's you. Create or rotate the API key within 10 minutes."
    })
  ).toBeVisible();
  await expect(page).toHaveURL(/\/account\/api-keys\?newApiKey=1&/);
  expect(new URL(page.url()).searchParams.has("github")).toBe(false);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Deploy bot");
  await expect(page.getByRole("group", { name: "Pastes" }).getByLabel("Read")).toBeChecked();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByRole("heading", { name: "Your new API key" })).toBeFocused();
  expect(api.apiKeysOf()[0].scopes).toEqual(["pastes:read"]);
  await expect(page).toHaveURL("/account/api-keys");
});

test("a deep link names only scope-shaped values, wrapped within 320 px", async ({ page, api }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const long = `${"a".repeat(29)}:${"b".repeat(10)}`;
  const scopes = [long, "Your account is locked. Call +1 555 0100", "x".repeat(120), "pastes:read"];
  await page.goto(
    `/account/api-keys?newApiKey=1&name=Bot&scopes=${encodeURIComponent(scopes.join())}`
  );

  await expect(page.getByRole("status")).toHaveText(
    `The link asked for scopes it can't set, so they're left out: ${long}.`
  );
  // Neither the page scrolls sideways nor the notice's text runs out of its box.
  await expect
    .poll(() => page.locator("html").evaluate((html) => html.scrollWidth - html.clientWidth))
    .toBe(0);
  const text = page.getByRole("status").locator(".status__text");
  await expect.poll(() => text.evaluate((el) => el.scrollWidth - el.clientWidth)).toBe(0);
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

test("a key made here shows in the admin's view of the account, and goes with the admin's revoke", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const admin = api.hasUser("vb2007", { superuser: true });
  await page.goto("/account/api-keys");
  await page.getByRole("button", { name: "Create an API key" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Admin script");
  // The superuser alone gets the admin scopes.
  await page.getByRole("group", { name: "Admin" }).getByLabel("Read").check({ force: true });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Create key" }).click();
  const token = (await page.locator(".token__text").textContent())!;

  await page.goto(`/admin/users/${admin.id}`);
  const keys = page.getByRole("list", { name: "vb2007's API keys" });
  await expect(keys.getByRole("heading", { level: 3 })).toHaveText([
    `Admin script ending in …${token.slice(-4)}`
  ]);
  await expect(keys).toContainText("admin:read");
  const row = page.locator(".action").filter({ hasText: "Revoke API keys" });
  await row.getByRole("button", { name: "Revoke API keys" }).click();
  await row.getByRole("button", { name: "Confirm revoke" }).click();
  await expect(keys).toHaveCount(0);

  await page.goto("/account/api-keys");
  await expect(page.getByText("No API keys yet.")).toBeVisible();
});

test("a visitor is asked to log in", async ({ page }) => {
  await page.goto("/account/api-keys");
  await expect(page.getByText("Log in to manage your API keys.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in" }).last()).toBeVisible();
});
