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

test("the password changes in place and the session carries on", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await details.getByRole("button", { name: "Change password" }).click();
  await expect(details.getByLabel("Current password")).toBeFocused();
  await details.getByLabel("Current password").fill("e2e-password");
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(details.getByRole("status")).toHaveText("Password changed successfully.");
  await expect(details.getByRole("button", { name: "Change password" })).toBeFocused();
  await expect(details.getByLabel("Current password")).toHaveCount(0);
  expect(api.password).toBe("a-new-password");

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Your account" })).toBeVisible();
});

test("a wrong current password is refused and the form keeps its values", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await details.getByRole("button", { name: "Change password" }).click();
  await details.getByLabel("Current password").fill("not-my-password");
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(details.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(details.getByLabel("Current password")).toHaveValue("not-my-password");
  expect(api.password).toBe("e2e-password");

  await page.keyboard.press("Escape");
  await expect(details.getByRole("button", { name: "Change password" })).toBeFocused();
  await expect(details.getByRole("alert")).toHaveCount(0);
});

test("the password form checks its fields before asking the API", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });
  const newPassword = details.getByLabel("New password", { exact: true });

  await details.getByRole("button", { name: "Change password" }).click();
  await details.getByLabel("Current password").fill("e2e-password");
  await newPassword.fill("short");
  await details.getByLabel("Confirm new password").fill("shorter");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(newPassword).toBeFocused();
  await expect(newPassword).toHaveAccessibleDescription(
    "8 to 128 characters. Use 8 to 128 characters."
  );
  await expect(details.getByText("The two passwords don't match.")).toBeVisible();
  expect(api.password).toBe("e2e-password");

  await newPassword.fill("a-new-password");
  await expect(newPassword).toHaveAccessibleDescription("8 to 128 characters.");
});

test("an account without a password has none to change", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await expect(
    details.getByText("This account has no password: you log in with GitHub.")
  ).toBeVisible();
  await expect(details.getByRole("button", { name: "Change password" })).toHaveCount(0);
});

for (const { status, error } of [
  { status: 400, error: "You must provide the current password and a new password." },
  { status: 409, error: "This account has no password: set one first with POST /user/password." },
  { status: 0, error: "Error connecting to server" }
]) {
  test(`a password change that fails with ${status || "no connection"} says why`, async ({
    page,
    api,
    baseURL
  }) => {
    api.loggedInAs("me@example.com", "me");
    // Registered after the API mock, so it wins; the CORS preflight still goes to the mock.
    await page.route("**/user/password", (route) => {
      if (route.request().method() !== "PATCH") return route.fallback();
      if (!status) return route.abort();
      return route.fulfill({
        status,
        headers: {
          "Access-Control-Allow-Origin": new URL(baseURL!).origin,
          "Access-Control-Allow-Credentials": "true"
        },
        json: { error }
      });
    });
    await page.goto("/account");
    const details = page.getByRole("region", { name: "Log-in details" });

    await details.getByRole("button", { name: "Change password" }).click();
    await details.getByLabel("Current password").fill("e2e-password");
    await details.getByLabel("New password", { exact: true }).fill("a-new-password");
    await details.getByLabel("Confirm new password").fill("a-new-password");
    await details.getByRole("button", { name: "Save password" }).click();

    await expect(details.getByRole("alert")).toHaveText(error);
    await expect(details.getByLabel("New password", { exact: true })).toHaveValue("a-new-password");
  });
}
