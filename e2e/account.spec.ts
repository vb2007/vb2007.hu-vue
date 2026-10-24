import { expect, test } from "./fixtures";

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
  await expect(page.getByText("@octocat")).toBeVisible();
  await expect(page.getByRole("link", { name: "Link GitHub" })).toHaveCount(0);

  await page.getByRole("button", { name: "Unlink GitHub" }).click();
  await page.getByRole("button", { name: "Confirm unlink" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "GitHub is unlinked. You can link it again any time."
  );
  await expect(page.getByText("Not linked")).toBeVisible();
  await expect(page.getByRole("link", { name: "Link GitHub" })).toBeVisible();

  // The API forgot the link too, so it stays unlinked after a reload.
  await page.reload();
  await expect(page.getByText("Not linked")).toBeVisible();
});

test("an account made with GitHub can't unlink it", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, hasPassword: false });
  await page.goto("/account");

  await expect(
    page.getByText(
      "This account has no password, so GitHub is how you log in. It can't be unlinked."
    )
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Unlink GitHub" })).toHaveCount(0);
});

test("coming back from linking GitHub confirms it once", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account?github=linked");

  await expect(page.getByRole("status")).toHaveText(
    "GitHub is linked. You can log in with it from now on."
  );
  await expect(page).toHaveURL("/account");

  await page.reload();
  await expect(page.getByText("@octocat")).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("a failed GitHub link is explained on the account page", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account?oauthError=githubAlreadyLinked");

  await expect(page.getByRole("alert")).toHaveText(
    "That GitHub account is already linked to another account here."
  );
  await expect(page).toHaveURL("/account");
});
