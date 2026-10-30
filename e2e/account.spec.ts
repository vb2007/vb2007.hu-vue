import { expect, MOCK_PASSWORD, test } from "./fixtures";

// GitHub login is a navigation to the API, which the mock doesn't serve, so these check where the
// keys lead instead of following them. Only linking is served: the mock skips GitHub and comes back.

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

test("a GitHub account other than the linked one is explained", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account?oauthError=githubOtherLinked");

  await expect(page.getByRole("alert")).toHaveText(
    "That isn't the GitHub account linked here. Switch to it on GitHub and try again."
  );
  await expect(page).toHaveURL("/account");
});

test("an account made with GitHub confirms it with GitHub, then sets a password", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const newPassword = page.getByLabel("New password");
  const confirmPassword = page.getByLabel("Confirm password");

  await newPassword.fill("short");
  await confirmPassword.fill("short");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("The password's too short: it must be between 8 and 128 characters.")
  ).toBeVisible();

  await newPassword.fill("correct horse battery");
  await confirmPassword.fill("correct horse battery");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Confirm it's you first: log in with GitHub again (or relink it), then set the password within 10 minutes."
  );
  await expect(page.getByRole("button", { name: "Set password" })).toHaveCount(0);
  const confirmWithGithub = page.getByRole("link", { name: "Confirm with GitHub" });
  await expect(confirmWithGithub).toBeFocused();

  await confirmWithGithub.click();
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set your password within 10 minutes."
  );
  await expect(newPassword).toHaveValue("");

  await newPassword.fill("correct horse battery");
  await confirmPassword.fill("correct horse battery");
  await page.getByRole("button", { name: "Set password" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Your password is set. You can log in with it from now on."
  );
  await expect(page.getByRole("status")).toBeFocused();
  // Focus scrolls the message into view, clear of the sticky navbar.
  const navbarBottom = (await page.locator("header.bar").boundingBox())!;
  const noticeTop = (await page.getByRole("status").boundingBox())!;
  expect(noticeTop.y).toBeGreaterThanOrEqual(navbarBottom.y + navbarBottom.height);
  await expect(page.getByRole("heading", { name: "Password" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unlink GitHub" })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("New password")).toHaveCount(0);
});

test("an account is deleted with its password and the visitor lands home logged out", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await expect(
    page.getByText("Deleting your account also deletes your pastes, short links and uploads.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();
  const password = page.getByLabel("Password");
  await expect(password).toBeFocused();
  const confirm = page.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeDisabled();

  await password.fill("wrong-password");
  await confirm.click();
  await expect(page.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(page).toHaveURL("/account");

  await password.fill(MOCK_PASSWORD);
  await confirm.click();

  await expect(page).toHaveURL("/");
  await expect(page.getByRole("link", { name: "me@example.com" })).toHaveCount(0);

  await page.goto("/account");
  await expect(page.getByText("Log in to see your account.")).toBeVisible();
});

test("an account made with GitHub is deleted by typing its username", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");

  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByText("Type “me” to confirm.")).toBeVisible();
  const confirm = page.getByRole("button", { name: "Delete account" });

  await expect(page.getByLabel("Username")).toHaveJSProperty("spellcheck", false);
  await page.getByLabel("Username").fill("m");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Username").fill("me");
  await confirm.click();

  await expect(page).toHaveURL("/");
});

test("deleting the account can be cancelled, and says when to try again", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  api.limitsPasswordChecks();
  await page.goto("/account");

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("alert")).toHaveText("Too many failed attempts: try again later.");

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();
});
