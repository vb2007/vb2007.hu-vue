import { E2E_PASSWORD, expect, test } from "./fixtures";

// GitHub login is a navigation to the API, which the mock doesn't serve, so these check where the
// keys lead instead of following them.

test("login and register offer GitHub next to the password form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Log in with GitHub" })).toHaveAttribute(
    "href",
    /\/auth\/github$/
  );

  await page.goto("/register");
  await expect(page.getByRole("link", { name: "Register with GitHub" })).toHaveAttribute(
    "href",
    /\/auth\/github$/
  );
});

test("a failed GitHub login is explained once, then dropped from the URL", async ({ page }) => {
  await page.goto("/login?oauthError=emailExists");

  await expect(page.getByRole("alert")).toHaveText(
    "An account already uses your GitHub e-mail address. Log in with your password, then link GitHub on your account page."
  );
  await expect(page).toHaveURL("/login");

  await page.reload();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the account page asks visitors to log in", async ({ page }) => {
  await page.goto("/account");

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(page.getByText("Log in to see your account.")).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
});

test("the navbar e-mail opens the account, which offers to link GitHub", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();

  await page.getByRole("link", { name: "me@example.com" }).click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
  await expect(page.getByText("me", { exact: true })).toBeVisible();
  await expect(page.getByText("Not linked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Link GitHub" })).toHaveAttribute(
    "href",
    /\/auth\/github\/link$/
  );
});

test("a linked GitHub account shows its login and unlinks on the second click", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account");

  await expect(page.getByText("Linked", { exact: true })).toBeVisible();
  await expect(page.getByText("You can log in with GitHub as @e2e-octocat.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Link GitHub" })).toHaveCount(0);

  await page.getByRole("button", { name: "Unlink GitHub" }).click();
  await page.getByRole("button", { name: "Confirm unlink" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "GitHub is unlinked. Log in with your password from now on."
  );
  await expect(page.getByText("Not linked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Link GitHub" })).toBeVisible();

  // The API forgot the link too, so it stays unlinked after a reload.
  await page.reload();
  await expect(page.getByText("Not linked")).toBeVisible();
});

test("an account made with GitHub can't unlink it", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");

  await expect(
    page.getByText("This account has no password, so GitHub stays linked")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlink GitHub" })).toHaveCount(0);
});

test("a GitHub account the API just linked is confirmed once", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account?github=linked");

  await expect(page.getByRole("status")).toHaveText(
    "GitHub is linked. You can log in with it from now on."
  );
  await expect(page).toHaveURL("/account");

  await page.reload();
  await expect(page.getByText("GitHub is linked.")).toHaveCount(0);
});

test("a failed GitHub link is explained on the account page", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account?oauthError=githubAlreadyLinked");

  await expect(page.getByRole("alert")).toHaveText(
    "That GitHub account is already linked to another account here."
  );
  await expect(page).toHaveURL("/account");
});

test("changing the e-mail shows the new address everywhere", async ({ page, api, isMobile }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await expect(page.getByLabel("New e-mail")).toBeFocused();
  await page.getByLabel("New e-mail").fill("New@Example.com");
  await page.getByLabel("Current password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: "Save e-mail" }).click();

  await expect(page.getByRole("status")).toHaveText("E-mail address updated successfully.");
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  await expect(page.getByLabel("New e-mail")).toHaveCount(0);
  await expect(page.getByRole("definition")).toHaveText(["me", "new@example.com"]);
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "new@example.com" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("definition")).toHaveText(["me", "new@example.com"]);
});

test("the e-mail form checks the address before sending it", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("not-an-address");
  await page.getByRole("button", { name: "Save e-mail" }).click();

  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();
  await expect(page.getByText("Enter your current password.")).toBeVisible();
  await expect(page.getByLabel("New e-mail")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

for (const [status, email, password, error] of [
  [400, "me@example..com", E2E_PASSWORD, "The e-mail address is invalid"],
  [403, "new@example.com", "wrong-password", "The provided password is incorrect."],
  [409, "taken@example.com", E2E_PASSWORD, "An account with this E-mail address already exists."]
] as const) {
  test(`a ${status} from the API keeps the form and the address`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    api.hasUser("taken");
    await page.goto("/account");

    await page.getByRole("button", { name: "Change e-mail" }).click();
    await page.getByLabel("New e-mail").fill(email);
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Save e-mail" }).click();

    await expect(page.getByRole("alert")).toContainText(error);
    await expect(page.getByLabel("New e-mail")).toHaveValue(email);
    await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);
  });
}

test("accounts that can't change their e-mail say why", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  await expect(
    page.getByText(
      "This account logs in with GitHub, so there's no password to confirm the change with."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);

  api.loggedInAs("admin@example.com", "admin", { superuser: true });
  await page.reload();
  await expect(page.getByText("It's set in the API's configuration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);
});
