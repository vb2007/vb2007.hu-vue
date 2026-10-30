import { expect, MOCK_EMAIL_CODE, MOCK_PASSWORD, test } from "./fixtures";

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

  await expect(page.getByText("It stays linked while it's your only way to log in.")).toBeVisible();
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

test("changing the e-mail takes the code mailed to the new address", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await expect(page.getByLabel("New e-mail")).toBeFocused();
  await page.getByLabel("New e-mail").fill("New@Example.com");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();

  // The address only changes once the code comes back.
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
  const code = page.getByLabel("Confirmation code");
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");
  await expect(code).toHaveAccessibleDescription(
    /^Waiting for confirmation: new@example\.com The code works for 15 minutes from when it was sent\./
  );
  await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);

  await code.fill(MOCK_EMAIL_CODE);
  await page.keyboard.press("Enter");

  await expect(page.getByRole("status")).toHaveText("E-mail address updated successfully.");
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("definition")).toHaveText(["me", "new@example.com"]);
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "new@example.com" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("definition")).toHaveText(["me", "new@example.com"]);
  await expect(page.getByText(/Waiting for confirmation/)).toHaveCount(0);
});

test("a wrong code keeps the change waiting", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  await page.goto("/account");

  await page.getByLabel("Confirmation code").fill("000000");
  await page.getByRole("button", { name: "Confirm code" }).click();

  const code = page.getByLabel("Confirmation code");
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAccessibleDescription(
    /The code is wrong, expired or already used: check it or request a new one\.$/
  );
  await expect(code).toBeFocused();
  await expect(code).toHaveValue("000000");
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
  await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);

  await page.getByLabel("Confirmation code").fill("12345");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Enter the 6-digit code from the e-mail.")).toBeVisible();
});

test("a waiting change survives a reload, and a new code is one password away", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("new@example.com");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Confirmation code")).toBeFocused();

  await page.reload();

  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
  await expect(page.getByLabel("Confirmation code")).toBeVisible();
  await page.getByRole("button", { name: "Change e-mail" }).click();
  await expect(page.getByLabel("New e-mail")).toHaveValue("new@example.com");
  await expect(page.getByLabel("Current password")).toBeFocused();
  await expect(page.getByText("A new code replaces the one already sent.")).toBeVisible();
  // The API's minute between codes outlasts the reload, so the key still waits it out.
  await expect(page.getByRole("button", { name: /^Send code in \d+ s$/ })).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Confirmation code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

test("asking for a new code too soon counts down the API's wait", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  // The last code went 57 seconds ago, so the API wants 3 more.
  api.hasPendingEmail("new@example.com", { sentSecondsAgo: 57 });
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A code was sent just now. You can send another once the countdown ends."
  );
  await expect(page.getByRole("button", { name: /^Send code in \d s$/ })).toBeDisabled();

  await expect(page.getByRole("button", { name: "Send code", exact: true })).toBeEnabled({
    timeout: 5000
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Send code", exact: true }).click();
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeVisible();
});

test("a code asked for in another tab shows up when the form is turned away", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { emailVerified: true });
  await page.goto("/account");
  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("other@example.com");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);

  // Meanwhile, another tab asks for a code to new@example.com.
  api.hasPendingEmail("new@example.com", { sentSecondsAgo: 5 });
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A code was sent just now. You can send another once the countdown ends."
  );
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
  await expect(page.getByText("Confirmed", { exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Confirmation code")).toBeVisible();
});

test("an address taken meanwhile drops the waiting change and says so", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  api.hasUser("taken");
  api.hasPendingEmail("taken@example.com");
  await page.goto("/account");

  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "taken@example.com wasn't confirmed. An account with this E-mail address already exists."
  );
  await expect(page.getByText(/Waiting for confirmation/)).toHaveCount(0);
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);

  // Nothing waits any more, so a new address goes straight away.
  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("other@example.com");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("Waiting for confirmation: other@example.com")).toBeVisible();
});

test("a code that expired with the page open takes the waiting change away", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  await page.goto("/account");
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();

  // 16 minutes pass with the page open.
  api.hasPendingEmail("new@example.com", { sentSecondsAgo: 16 * 60 });
  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "new@example.com wasn't confirmed: its code expired. Send a new one with Change e-mail."
  );
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

test("the e-mail form checks the address before sending it", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("not-an-address");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();
  await expect(page.getByText("Enter your current password.")).toBeVisible();
  await expect(page.getByLabel("New e-mail")).toBeFocused();

  await page.getByLabel("New e-mail").fill(" Me@Example.com ");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("That's already your e-mail address.")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

// The form checks the address with the API's own rule, so a 400 can't come from it.
for (const [status, email, password, error] of [
  [403, "new@example.com", "wrong-password", "The provided password is incorrect."],
  [409, "taken@example.com", MOCK_PASSWORD, "An account with this E-mail address already exists."],
  [429, "new@example.com", MOCK_PASSWORD, "Too many failed attempts: try again later."]
] as const) {
  test(`a ${status} from the API keeps the form and the address`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    api.hasUser("taken");
    if (status === 429) api.limitsPasswordChecks();
    await page.goto("/account");

    await page.getByRole("button", { name: "Change e-mail" }).click();
    await page.getByLabel("New e-mail").fill(email);
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByRole("alert")).toContainText(error);
    await expect(page.getByLabel("New e-mail")).toHaveValue(email);
    await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New e-mail")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  });
}

test("accounts that can't change their e-mail say why", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  await expect(page.getByText("Changing it needs a password.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);

  api.loggedInAs("admin@example.com", "admin", { superuser: true });
  await page.reload();
  await expect(page.getByText("It's set in the API's configuration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);
});

test("the password changes in place and the session carries on", async ({ page, api }) => {
  // A real login, so the browser holds a VB-AUTH cookie that the change has to replace.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();
  const sessionCookie = async () =>
    (await page.context().cookies()).find((cookie) => cookie.name === "VB-AUTH")?.value;
  expect(await sessionCookie()).toBe("e2e-session-1");

  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await details.getByRole("button", { name: "Change password" }).click();
  await expect(details.getByLabel("Current password")).toBeFocused();
  await details.getByLabel("Current password").fill(MOCK_PASSWORD);
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(details.getByRole("status")).toHaveText("Password changed successfully.");
  await expect(details.getByRole("button", { name: "Change password" })).toBeFocused();
  await expect(details.getByLabel("Current password")).toHaveCount(0);
  expect(api.password).toBe("a-new-password");
  expect(await sessionCookie()).toBe("e2e-session-2");

  // The mock now answers the old cookie as logged out, so this only passes on the new one.
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
  expect(api.password).toBe(MOCK_PASSWORD);

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
  await details.getByLabel("Current password").fill(MOCK_PASSWORD);
  await newPassword.fill("short");
  await details.getByLabel("Confirm new password").fill("shorter");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(newPassword).toBeFocused();
  await expect(newPassword).toHaveAccessibleDescription(
    "8 to 128 characters. The password's too short: it must be between 8 and 128 characters."
  );
  await expect(details.getByText("The two passwords don't match.")).toBeVisible();
  expect(api.password).toBe(MOCK_PASSWORD);

  await newPassword.fill("a-new-password");
  await expect(newPassword).toHaveAccessibleDescription("8 to 128 characters.");
});

test("an account without a password has none to change", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await expect(details.getByText("None yet. Set one in the Password section below.")).toBeVisible();
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
    await details.getByLabel("Current password").fill(MOCK_PASSWORD);
    await details.getByLabel("New password", { exact: true }).fill("a-new-password");
    await details.getByLabel("Confirm new password").fill("a-new-password");
    await details.getByRole("button", { name: "Save password" }).click();

    await expect(details.getByRole("alert")).toHaveText(error);
    await expect(details.getByLabel("New password", { exact: true })).toHaveValue("a-new-password");
  });
}

test("a password change that's rate limited says when to try again", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  api.limitsPasswordChecks();
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });

  await details.getByRole("button", { name: "Change password" }).click();
  await details.getByLabel("Current password").fill(MOCK_PASSWORD);
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(details.getByRole("alert")).toHaveText("Too many failed attempts: try again later.");
  expect(api.password).toBe(MOCK_PASSWORD);
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
  await expect(page.getByRole("region", { name: "Password", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Unlink GitHub" })).toBeVisible();

  // The new password can be changed straight away, without a reload.
  const details = page.getByRole("region", { name: "Log-in details" });
  await details.getByRole("button", { name: "Change password" }).click();
  await details.getByLabel("Current password").fill("correct horse battery");
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();
  await expect(details.getByRole("status")).toHaveText("Password changed successfully.");
  expect(api.password).toBe("a-new-password");

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
