import {
  callApi,
  expect,
  MAIL_FAILED_ERROR,
  MOCK_EMAIL,
  MOCK_EMAIL_CODE,
  MOCK_PASSWORD,
  MOCK_SUPERUSER_EMAIL,
  type MockApi,
  test
} from "./fixtures";

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

test("a refused login shows the API's one message and stays logged out", async ({ page, api }) => {
  // A GitHub-only account has no password to log in with. A second account next to MOCK_EMAIL's,
  // which `loggedInAs` would replace (both are MOCK_USER_ID).
  api.hasUser("octo", { password: false, githubLogin: "octo" });
  await page.goto("/login");
  const main = page.getByRole("main");
  const logIn = main.getByRole("button", { name: "Log in", exact: true });

  // A wrong password, an unknown address and a GitHub-only account all get the same answer.
  for (const [email, password] of [
    [MOCK_EMAIL, "not-the-password"],
    ["nobody@example.com", MOCK_PASSWORD],
    ["octo@example.com", MOCK_PASSWORD]
  ]) {
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    const answer = page.waitForResponse((response) => response.url().endsWith("/auth/login"));
    await logIn.click();
    expect((await answer).status()).toBe(403);
    // The alert keeps the same text between passes, so wait until the key is done with this
    // pass's answer: `login()` sets the message before the key stops loading.
    await expect(main.locator("button[type=submit]")).not.toHaveAttribute("aria-busy", "true");
    await expect(logIn).toBeVisible();
    await expect(main.getByRole("alert")).toHaveText(
      "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
    );
  }
  await expect(main).not.toContainText("Login successful!");
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).not.toContain("__Host-VB-AUTH");

  // The address's case and surrounding spaces don't matter, like the API.
  await page.getByLabel("E-mail").fill(` ${MOCK_EMAIL.toUpperCase()} `);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await logIn.click();
  await expect(main).toContainText("Login successful!");
});

test("logging out on the login page brings the form back without the password", async ({
  page,
  isMobile
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();

  // Maybe on a shared machine: the next person doesn't get the password. The address stays.
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("E-mail")).toHaveValue(MOCK_EMAIL);
});

test("a locked-out login points to GitHub and holds the key for that address, counting the wait", async ({
  page,
  api
}) => {
  const LOCKED_OUT =
    "Too many failed attempts. Try again later, or log in with GitHub below if it's linked to your account.";
  await page.clock.install();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a-wrong-password");

  // Without a wait from the API, it still explains the lockout, and there's nothing to hold.
  api.locksLogins(null);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(LOCKED_OUT);
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
  // It was disabled while it loaded, which drops the focus; the focus goes back to it.
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeFocused();

  // With one, the key counts it down and is the only wait on show; screen readers hear it in words.
  api.locksLogins(14 * 60 + 5);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toHaveText(`${LOCKED_OUT} Try again in 15 minutes.`);
  await expect(page.getByRole("link", { name: "Log in with GitHub" })).toBeVisible();
  const key = page.getByRole("button", { name: /^Try again in \d+ minutes$/ });
  await expect(key).toHaveText(/^Try again in \d+ min$/);
  await expect(key).toBeDisabled();
  // Described by the message as shown, so its counting name is the one wait it states.
  await expect(key).toHaveAccessibleDescription(LOCKED_OUT);
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();

  // The lockout can be about the address alone, so another one may go at once, without it.
  await page.getByLabel("E-mail").fill("other@example.com");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
  await expect(alert).toHaveCount(0);
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await expect(key).toBeDisabled();
  await expect(alert).toHaveText(`${LOCKED_OUT} Try again in 15 minutes.`);

  // A jump, rather than every tick of the countdown on the way.
  await page.clock.fastForward(845_000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
});

test("a held address keeps its own lockout after another address is refused", async ({
  page,
  api
}) => {
  const LOCKED_OUT =
    "Too many failed attempts. Try again later, or log in with GitHub below if it's linked to your account.";
  await page.clock.install();
  await page.goto("/login");
  const logIn = page.getByRole("button", { name: "Log in", exact: true });
  const key = page.getByRole("button", { name: /^Try again in \d+ minutes$/ });
  const alert = page.getByRole("alert");
  api.locksLogins(14 * 60 + 5, MOCK_EMAIL);
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a-wrong-password");
  await logIn.click();
  await expect(key).toBeDisabled();

  // Another address may go at once; its refusal is about it, not the held one.
  await page.getByLabel("E-mail").fill("other@example.com");
  await logIn.click();
  await expect(alert).toHaveText(
    "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
  );
  await expect(logIn).toBeFocused();

  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await expect(key).toBeDisabled();
  await expect(alert).toHaveText(`${LOCKED_OUT} Try again in 15 minutes.`);
  await expect(key).toHaveAccessibleDescription(LOCKED_OUT);

  // Once the wait is over, the other address's refusal doesn't come over this one's key.
  await page.clock.fastForward(845_000);
  await expect(logIn).toBeEnabled();
  await expect(alert).toHaveCount(0);
});

test("a lockout goes with its hold once the login form is left", async ({ page, api }) => {
  await page.clock.install();
  await page.goto("/login");
  api.locksLogins(14 * 60 + 5, MOCK_EMAIL);
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a-wrong-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Try again in \d+ minutes$/ })).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("Too many failed attempts.");

  // Within the page, so the module's state stays: a reload would forget it anyway.
  await page.getByRole("main").getByRole("link", { name: "Register" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
  await page.goBack();
  // The register form leaves before this one comes, and has an "E-mail" field too.
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();

  // The form is new, and so is its key: no hold, so no lockout above it either.
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill("a-wrong-password");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeEnabled();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("a login still on its way when the form is left logs the page in once it lands", async ({
  page,
  isMobile
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  let answer!: () => void;
  const answered = new Promise<void>((resolve) => (answer = resolve));
  await page.route("**/auth/login", async (route) => {
    await answered;
    await route.fallback();
  });
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await page.getByRole("main").getByRole("link", { name: "Register" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
  answer();

  // The API's session is live, so the page says so, with the way to end it.
  await expect(page.getByText("Login successful!")).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Link GitHub", exact: true })).toBeVisible();
});

test("linking GitHub takes the password, then comes back linked", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const github = page.getByRole("region", { name: "Linked accounts" });

  await github.getByRole("button", { name: "Link GitHub", exact: true }).click();
  const password = github.getByLabel("Password");
  await expect(password).toBeFocused();
  await password.fill(MOCK_PASSWORD);
  await github.getByRole("button", { name: "Continue to GitHub" }).click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub is linked. You can log in with it from now on."
  );
  await expect(page.getByText("You can log in with GitHub as @e2e-octocat.")).toBeVisible();
  await expect(github.getByRole("button", { name: "Unlink GitHub" })).toBeVisible();
});

test("a wrong password doesn't start the GitHub link", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const github = page.getByRole("region", { name: "Linked accounts" });

  await github.getByRole("button", { name: "Link GitHub", exact: true }).click();
  await github.getByLabel("Password").fill("not-the-password");
  await github.getByRole("button", { name: "Continue to GitHub" }).click();

  await expect(github.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(github.getByLabel("Password")).toBeFocused();
  await expect(github.getByLabel("Password")).toHaveValue("not-the-password");
  await expect(page.getByText("Not linked")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(github.getByLabel("Password")).toHaveCount(0);
  await expect(github.getByRole("button", { name: "Link GitHub", exact: true })).toBeFocused();
});

for (const [what, arrange, error, spoken] of [
  [
    "too many failed tries",
    (api: MockApi) => api.limitsPasswordChecks(),
    "Too many failed attempts: try again later.",
    // The held key's wait, read out with the message.
    "Try again in 15 minutes."
  ],
  [
    "an API without GitHub",
    (api: MockApi) => api.githubIsNotConfigured(),
    "GitHub login isn't available right now.",
    ""
  ],
  [
    // The API's password limit runs before the link route checks for GitHub (vb2007/vb2007.hu-api#243).
    "too many failed tries, even on an API without GitHub",
    (api: MockApi) => {
      api.limitsPasswordChecks();
      api.githubIsNotConfigured();
    },
    "Too many failed attempts: try again later.",
    "Try again in 15 minutes."
  ]
] as const) {
  test(`a GitHub link refused for ${what} says why`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    arrange(api);
    await page.goto("/account");
    const github = page.getByRole("region", { name: "Linked accounts" });

    await github.getByRole("button", { name: "Link GitHub", exact: true }).click();
    await github.getByLabel("Password").fill(MOCK_PASSWORD);
    await github.getByRole("button", { name: "Continue to GitHub" }).click();

    await expect(github.getByRole("alert")).toHaveText(spoken ? `${error} ${spoken}` : error);
    // The field is described by the message as shown, then its hint: the wait in words is the
    // alert's alone, so it never contradicts the held key's count.
    await expect(github.getByLabel("Password")).toHaveAccessibleDescription(
      `${error} Confirms it's you. GitHub opens next, to approve the link.`
    );
    if (spoken) {
      await expect(
        github.getByRole("button", { name: /^Try again in/ })
      ).toHaveAccessibleDescription(error);
    }
    await expect(page).toHaveURL("/account");
  });
}

test("a GitHub link started without the password is explained", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  await expect(page.getByText("Not linked")).toBeVisible();

  // An old bookmark or a hand-typed URL: a password account can't link through a plain visit.
  await page.goto(`${api.apiOrigin}/auth/github/link`);

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("alert")).toHaveText(
    "Linking GitHub takes your password. Press Link GitHub on this page and enter it there."
  );
  await expect(page.getByText("Not linked")).toBeVisible();
});

test("a GitHub link visit from a session replaced elsewhere asks to log in again", async ({
  page,
  api
}) => {
  // A real login, so the browser holds a __Host-VB-AUTH cookie the API can replace.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();

  // A login on another device replaces this session, so the API sends the visit back as logged out.
  api.replacesSession();
  await page.goto(`${api.apiOrigin}/auth/github/link`);

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("alert")).toHaveText(
    "Your session ended before GitHub could be linked. Log in, then link GitHub again."
  );
});

test("confirming with GitHub on an API without GitHub says it isn't available", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  api.githubIsNotConfigured();
  await page.goto("/account");
  const deletion = page.getByRole("region", { name: "Delete account" });
  await deletion.getByRole("button", { name: "Delete account" }).click();
  await deletion.getByLabel("Username").fill("me");
  await deletion.getByRole("button", { name: "Delete account" }).click();

  await deletion.getByRole("link", { name: "Confirm with GitHub" }).click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("alert")).toHaveText("GitHub login isn't available right now.");
});

test("a GitHub link that wasn't started here is turned away", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  await expect(page.getByText("Not linked")).toBeVisible();

  // GitHub's approval without this session's start, e.g. one a second start replaced.
  await page.goto(`${api.apiOrigin}/e2e-github/authorize?state=stale`);

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("alert")).toHaveText(
    "The GitHub login or link took too long, was started elsewhere, or was replaced by a newer one. Please try again."
  );
  await expect(page.getByText("Not linked")).toBeVisible();
});

test("an account made with GitHub links again without a password", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { password: false });
  await page.goto("/account");
  const github = page.getByRole("region", { name: "Linked accounts" });

  await github.getByRole("button", { name: "Link GitHub", exact: true }).click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set your password within 10 minutes."
  );
  await expect(page.getByText("You can log in with GitHub as @e2e-octocat.")).toBeVisible();
});

test("a linked GitHub account shows its login and unlinks with the password", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account");
  const github = page.getByRole("region", { name: "Linked accounts" });

  await expect(page.getByText("Linked", { exact: true })).toBeVisible();
  await expect(page.getByText("You can log in with GitHub as @e2e-octocat.")).toBeVisible();
  await expect(github.getByRole("button", { name: "Link GitHub", exact: true })).toHaveCount(0);

  await github.getByRole("button", { name: "Unlink GitHub" }).click();
  await expect(github.getByLabel("Password")).toBeFocused();
  await github.getByLabel("Password").fill(MOCK_PASSWORD);
  await github.getByRole("button", { name: "Unlink GitHub" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "GitHub is unlinked. Log in with your password from now on."
  );
  await expect(page.getByRole("status")).toBeFocused();
  await expect(page.getByText("Not linked")).toBeVisible();
  await expect(github.getByRole("button", { name: "Link GitHub", exact: true })).toBeVisible();

  // The API forgot the link too, so it stays unlinked after a reload.
  await page.reload();
  await expect(page.getByText("Not linked")).toBeVisible();
});

test("a wrong password keeps GitHub linked", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account");
  const github = page.getByRole("region", { name: "Linked accounts" });

  await github.getByRole("button", { name: "Unlink GitHub" }).click();
  await github.getByLabel("Password").fill("not-the-password");
  await github.getByRole("button", { name: "Unlink GitHub" }).click();

  await expect(github.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(github.getByLabel("Password")).toBeFocused();

  await github.getByRole("button", { name: "Cancel" }).click();
  await expect(github.getByRole("button", { name: "Unlink GitHub" })).toBeFocused();
  await page.reload();
  await expect(page.getByText("Linked", { exact: true })).toBeVisible();
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

test("the GitHub link notice goes once the e-mail form opens", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true });
  await page.goto("/account?github=linked");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub is linked. You can log in with it from now on."
  );

  await page.getByRole("button", { name: "Change e-mail" }).click();

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

test("a code past the daily cap of wrong codes holds Confirm code for hours", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  api.capsCodeChecks();
  await page.goto("/account");

  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Too many failed attempts: try again later. Try again in 23 hours 45 minutes."
  );
  // "23 hours" wouldn't contain the visible "23 hr", so the label names the key, and the alert says
  // the wait in words. The key is described by the message as shown, so it states one wait.
  const key = page.getByRole("button", { name: /^Try again in \d+ hr \d+ min$/ });
  await expect(key).toHaveAccessibleDescription("Too many failed attempts: try again later.");
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
  // Asking for a new code has limits of its own.
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeEnabled();
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
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
  await expect(page.getByRole("button", { name: /^Send code in \d+ seconds?$/ })).toBeDisabled();

  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Confirmation code")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

test("asking for a new code too soon counts down the API's wait", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  // The API wants 8 more seconds when "Send code" is clicked. The mock pins that at the request,
  // not here, so a slow page load on a busy runner host can't run the countdown out beforehand.
  api.hasPendingEmail("new@example.com", { sentSecondsAgo: 52, cooldownLeftOnSend: 8 });
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A code was sent just now. You can send another once the countdown ends."
  );
  await expect(page.getByRole("button", { name: /^Send code in \d seconds?$/ })).toBeDisabled();

  await expect(page.getByRole("button", { name: "Send code", exact: true })).toBeEnabled({
    // The 8-second countdown, plus CI's 20-second assertion budget for a slow host.
    timeout: 30_000
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

// The API mails a code to another account's address or the superuser's like to any other, so it
// doesn't show which addresses have accounts: only the confirm refuses them (vb2007/vb2007.hu-api#291).
for (const [status, address, error] of [
  [409, "taken@example.com", "An account with this E-mail address already exists."],
  [403, MOCK_SUPERUSER_EMAIL, "This e-mail address is reserved for the superuser."]
] as const) {
  test(`a ${status} at confirm drops the waiting change and says so`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    api.hasUser("taken");
    await page.goto("/account");

    await page.getByRole("button", { name: "Change e-mail" }).click();
    await page.getByLabel("New e-mail").fill(address);
    await page.getByLabel("Current password").fill(MOCK_PASSWORD);
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByText(`Waiting for confirmation: ${address}`)).toBeVisible();

    await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
    await page.getByRole("button", { name: "Confirm code" }).click();

    await expect(page.getByRole("alert")).toHaveText(`${address} wasn't confirmed. ${error}`);
    await expect(page.getByText(/Waiting for confirmation/)).toHaveCount(0);
    await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
    await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);

    // Nothing waits any more, so the form comes back empty and a new address goes straight away.
    await page.getByRole("button", { name: "Change e-mail" }).click();
    await expect(page.getByLabel("New e-mail")).toBeFocused();
    await expect(page.getByLabel("New e-mail")).toHaveValue("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByLabel("New e-mail").fill("other@example.com");
    await page.getByLabel("Current password").fill(MOCK_PASSWORD);
    await page.getByRole("button", { name: "Send code", exact: true }).click();
    await expect(page.getByText("Waiting for confirmation: other@example.com")).toBeVisible();
  });
}

test("the address of an account nobody is logged in to is refused at confirm too", async ({
  page,
  api
}) => {
  // MOCK_EMAIL's account, which only the login knows. Logging in to another one leaves it there, where
  // `loggedInAs` would replace it (both are MOCK_USER_ID).
  api.hasUser("other");
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("other@example.com");
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main")).toContainText("Login successful!");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText(`Waiting for confirmation: ${MOCK_EMAIL}`)).toBeVisible();

  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  const confirmed = page.waitForResponse((response) =>
    response.url().includes("/user/email/confirm")
  );
  await page.getByRole("button", { name: "Confirm code" }).click();

  expect((await confirmed).status()).toBe(409);
  await expect(page.getByRole("alert")).toHaveText(
    `${MOCK_EMAIL} wasn't confirmed. An account with this E-mail address already exists.`
  );
  await expect(page.getByRole("definition")).toHaveText(["other", "other@example.com"]);
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

test("a change confirmed in another tab shows as confirmed, not as an expired code", async ({
  page,
  api,
  baseURL
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  await page.goto("/account");
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();

  // Another tab, on the same mock, confirms the code first.
  const appOrigin = new URL(baseURL!).origin;
  const other = await page.context().newPage();
  await other.route(
    (url) => url.origin !== appOrigin,
    (route) => api.handle(route, appOrigin)
  );
  await other.goto("/account");
  await other.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await other.getByRole("button", { name: "Confirm code" }).click();
  await expect(other.getByRole("status")).toHaveText("E-mail address updated successfully.");
  await other.close();

  // This tab's code is spent now, so the API refuses it with a 400.
  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("status")).toHaveText("E-mail address updated.");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/wasn't confirmed/)).toHaveCount(0);
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  await expect(page.getByRole("definition")).toHaveText(["me", "new@example.com"]);
});

test("a session that ended elsewhere logs the account page out, without blaming the change", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  await page.goto("/account");
  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();

  // A login on another device (or a password reset) ends this one: the API keeps one session.
  api.loggedOut();
  await page.getByLabel("Confirmation code").fill(MOCK_EMAIL_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  const ended = page.getByRole("status");
  await expect(ended).toHaveText(
    "Your session ended, so you're logged out: it expired, the password was reset, or the account was logged in or out elsewhere. Log in again to see your account."
  );
  await expect(ended).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText(/wasn't confirmed/)).toHaveCount(0);
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "me@example.com" })).toHaveCount(0);
  if (isMobile) await page.keyboard.press("Escape");

  await page.getByRole("main").getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
});

test("the e-mail form checks the address before sending it", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("not-an-address");
  // The key looks disabled until the form is right, but a click still shows what's missing.
  await expect(page.getByRole("button", { name: "Send code" })).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  await page.getByRole("button", { name: "Send code" }).click({ force: true });

  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();
  await expect(page.getByText("Enter your current password.")).toBeVisible();
  await expect(page.getByLabel("New e-mail")).toBeFocused();

  // Only plain addresses, like the API: the part before the @ has its own limit.
  await page.getByLabel("New e-mail").fill(`${"a".repeat(65)}@example.com`);
  await expect(
    page.getByText(
      "The part of your e-mail address before the @ can't be longer than 64 characters."
    )
  ).toBeVisible();
  await page.getByLabel("New e-mail").fill('"me"@example.com');
  await expect(page.getByText("Enter a valid e-mail address.")).toBeVisible();

  await page.getByLabel("New e-mail").fill(" Me@Example.com ");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  // Leaving the address checked it already.
  await expect(page.getByText("That's already your e-mail address.")).toBeVisible();
  await page.getByRole("button", { name: "Send code" }).click({ force: true });
  await expect(page.getByLabel("New e-mail")).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
});

// The form checks the address's format with the API's own rule, but only the API checks its domain
// (vb2007/vb2007.hu-api#217). A taken address gets a code like any other.
for (const [status, email, password, error] of [
  [
    400,
    "new@mailinator.com",
    MOCK_PASSWORD,
    "Disposable (temporary) e-mail addresses can't be used: use a permanent one."
  ],
  [403, "new@example.com", "wrong-password", "The provided password is incorrect."],
  [429, "new@example.com", MOCK_PASSWORD, "Too many failed attempts: try again later."]
] as const) {
  test(`a ${status} from the API keeps the form and the address`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    if (status === 429) api.limitsPasswordChecks();
    await page.goto("/account");

    await page.getByRole("button", { name: "Change e-mail" }).click();
    await page.getByLabel("New e-mail").fill(email);
    await page.getByLabel("Current password").fill(password);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByRole("alert")).toContainText(error);
    await expect(page.getByLabel("New e-mail")).toHaveValue(email);
    await expect(page.getByRole("definition")).toHaveText(["me", "me@example.com"]);
    // No code went out, so the key isn't held back; a 429 counts its wait down on it (see below).
    if (status !== 429) {
      await expect(page.getByRole("button", { name: "Send code", exact: true })).toBeEnabled();
    }

    await page.keyboard.press("Escape");
    await expect(page.getByLabel("New e-mail")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Change e-mail" })).toBeFocused();
  });
}

// Every rate limiter's 429 sends its wait too (vb2007/vb2007.hu-api#242), but no code went out.
for (const [what, arrange, error, label] of [
  [
    "too many failed passwords",
    (api: MockApi) => api.limitsPasswordChecks(),
    "Too many failed attempts: try again later.",
    "Send code in 15 min"
  ],
  [
    "too many e-mails",
    (api: MockApi) => api.limitsMailSends(),
    "Too many e-mails requested: try again later.",
    "Send code in 57 min"
  ]
] as const) {
  test(`a change refused for ${what} isn't taken for a code just sent`, async ({ page, api }) => {
    api.loggedInAs("me@example.com", "me");
    arrange(api);
    await page.goto("/account");

    await page.getByRole("button", { name: "Change e-mail" }).click();
    await page.getByLabel("New e-mail").fill("new@example.com");
    await page.getByLabel("Current password").fill(MOCK_PASSWORD);
    await page.getByRole("button", { name: "Send code" }).click();

    await expect(page.getByRole("alert")).toHaveText(error);
    await expect(page.getByRole("button", { name: label })).toBeDisabled();
    await expect(page.getByText(/Waiting for confirmation/)).toHaveCount(0);
    await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  });
}

test("a code whose mail failed keeps the change that waited, and another goes at once", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("old@example.com");
  api.failsNextMail();
  await page.goto("/account");

  await page.getByRole("button", { name: "Change e-mail" }).click();
  await page.getByLabel("New e-mail").fill("new@example.com");
  await page.getByLabel("Current password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "The e-mail couldn't be sent: please try again later."
  );
  // The API keeps the change that waited before, and no countdown holds the key.
  await expect(page.getByText("Waiting for confirmation: old@example.com")).toBeVisible();
  await expect(page.getByLabel("New e-mail")).toHaveValue("new@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByText("Waiting for confirmation: new@example.com")).toBeVisible();
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
});

// The day's mails are used up at 250: unlike sign-up (200) and reset codes (225), a change's code goes until then.
test("a change's code goes until the day's 250 mails are used up, then is refused", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("old@example.com", { sentSecondsAgo: 120 });
  api.sentMailToday(249);
  await page.goto("/account");
  const change = (email: string) =>
    callApi(page, api, "PATCH", "/user/email", { email, password: MOCK_PASSWORD });

  expect((await change("new@example.com")).status).toBe(202);
  api.clockRunsFor(60_000);
  expect(await change("newer@example.com")).toEqual({
    status: 503,
    body: { error: MAIL_FAILED_ERROR }
  });

  // The change that waited before stays, so the code for it still works.
  const confirmed = await callApi(page, api, "POST", "/user/email/confirm", {
    code: MOCK_EMAIL_CODE
  });
  expect(confirmed.status).toBe(200);
});

test("a change's code that couldn't be mailed gives its mail of the day back", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me");
  api.sentMailToday(249);
  api.failsNextMail();
  await page.goto("/account");
  const change = () =>
    callApi(page, api, "PATCH", "/user/email", {
      email: "new@example.com",
      password: MOCK_PASSWORD
    });

  expect((await change()).status).toBe(503);

  // Kept, the failed one would have been the 250th and this code refused.
  expect((await change()).status).toBe(202);
});

test("the notice after a change counts against the day's mails", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  api.hasPendingEmail("new@example.com");
  api.sentMailToday(248);
  await page.goto("/account");

  // The notice to the old address is the 249th mail.
  const confirmed = await callApi(page, api, "POST", "/user/email/confirm", {
    code: MOCK_EMAIL_CODE
  });
  expect(confirmed.status).toBe(200);

  const change = (email: string) =>
    callApi(page, api, "PATCH", "/user/email", { email, password: MOCK_PASSWORD });
  expect((await change("newer@example.com")).status).toBe(202);
  api.clockRunsFor(60_000);
  expect((await change("newest@example.com")).status).toBe(503);
});

test("accounts that can't change their e-mail say why", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  await expect(page.getByText("Changing it needs a password.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);

  api.loggedInAs(MOCK_SUPERUSER_EMAIL, "admin", { superuser: true });
  await page.reload();
  await expect(page.getByText("It's set in the API's configuration.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Change e-mail" })).toHaveCount(0);
});

test("the password changes in place and the session carries on", async ({ page, api }) => {
  // A real login, so the browser holds a __Host-VB-AUTH cookie that the change has to replace.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();
  const sessionCookie = async () =>
    (await page.context().cookies()).find((cookie) => cookie.name === "__Host-VB-AUTH")?.value;
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

test("a session that ended elsewhere logs the page out when the password is changed", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");
  const details = page.getByRole("region", { name: "Log-in details" });
  await details.getByRole("button", { name: "Change password" }).click();
  await details.getByLabel("Current password").fill(MOCK_PASSWORD);
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");

  // A login on another device (or a password reset) ends this one: the API keeps one session.
  api.loggedOut();
  await details.getByRole("button", { name: "Save password" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  const ended = page.getByRole("status");
  await expect(ended).toHaveText(
    "Your session ended, so you're logged out: it expired, the password was reset, or the account was logged in or out elsewhere. Log in again to see your account."
  );
  await expect(ended).toBeFocused();
  await expect(page.getByLabel("Current password")).toHaveCount(0);
  expect(api.password).toBe(MOCK_PASSWORD);
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "me@example.com" })).toHaveCount(0);
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
  await details.getByRole("button", { name: "Save password" }).click({ force: true });

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

  await expect(details.getByRole("alert")).toHaveText(
    "Too many failed attempts: try again later. Try again in 15 minutes."
  );
  expect(api.password).toBe(MOCK_PASSWORD);
  const key = details.getByRole("button", { name: /^Try again in \d+ minutes$/ });
  await expect(key).toHaveText(/^Try again in \d+ min$/);
  await expect(key).toHaveAccessibleDescription("Too many failed attempts: try again later.");
  await expect(key).toBeDisabled();
  await expect(details.getByLabel("Current password")).toBeFocused();
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
  // Leaving the field checked it already; the key only looks disabled.
  await expect(
    page.getByText("The password's too short: it must be between 8 and 128 characters.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Set password" }).click({ force: true });
  await expect(newPassword).toBeFocused();

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

  // The new password can be changed straight away, without a reload, and only that outcome shows.
  const details = page.getByRole("region", { name: "Log-in details" });
  await details.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByRole("status")).toHaveCount(0);
  await details.getByLabel("Current password").fill("correct horse battery");
  await details.getByLabel("New password", { exact: true }).fill("a-new-password");
  await details.getByLabel("Confirm new password").fill("a-new-password");
  await details.getByRole("button", { name: "Save password" }).click();
  await expect(page.getByRole("status")).toHaveText(["Password changed successfully."]);
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

  // The deleted account can't log in again.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(
    "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
  );
});

test("an account arranged before another login still logs in, under its own name", async ({
  page,
  api
}) => {
  // MOCK_EMAIL's address: the row takes that login over, so `loggedInAs` doesn't replace it.
  api.hasUser("me");
  api.loggedInAs("anna@example.com", "anna");
  api.loggedOut();

  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main")).toContainText("Login successful!");

  await page.goto("/account");
  await expect(page.getByRole("definition")).toHaveText(["me", MOCK_EMAIL]);
});

test("a deleted account's name and address are free again", async ({ page, api }) => {
  // The default account: e2e@example.com, "e2e", with MOCK_EMAIL's id, so it's that account moved.
  api.loggedInAs();
  await page.goto("/account");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page).toHaveURL("/");

  await page.goto("/register");
  const username = page.getByLabel("Username");
  const checked = page.waitForResponse((response) =>
    response.url().includes("/auth/username-available")
  );
  await username.fill("e2e");
  expect(await (await checked).json()).toEqual({ available: true });
  await expect(username).not.toHaveAttribute("aria-invalid", "true");

  // Neither the address it had nor the one it was moved from logs in any more.
  for (const address of ["e2e@example.com", MOCK_EMAIL]) {
    const login = await callApi(page, api, "POST", "/auth/login", {
      email: address,
      password: MOCK_PASSWORD
    });
    expect(login.status).toBe(403);
  }
});

test("an account made with GitHub is deleted by typing its username, once GitHub confirms it's them", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const deletion = page.getByRole("region", { name: "Delete account" });

  await deletion.getByRole("button", { name: "Delete account" }).click();
  await expect(deletion.getByText("Type “me” to confirm.")).toBeVisible();
  const username = deletion.getByLabel("Username");
  const confirm = deletion.getByRole("button", { name: "Delete account" });

  await expect(username).toHaveJSProperty("spellcheck", false);
  await username.fill("m");
  await expect(confirm).toBeDisabled();
  await username.fill("me");
  await confirm.click();

  // The API wants GitHub to confirm it's them first: an expected step, not a fault.
  await expect(deletion.getByRole("status")).toHaveText(
    "Confirm it's you first: log in with GitHub again (or relink it), then delete the account within 10 minutes."
  );
  await expect(deletion.getByRole("alert")).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
  const github = deletion.getByRole("link", { name: "Confirm with GitHub" });
  await expect(github).toBeFocused();
  await github.click();

  // Back from GitHub, the form is open again and says so where the focus lands, once.
  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("status")).toHaveText([
    "GitHub confirmed it's you. Delete the account within 10 minutes."
  ]);
  await expect(deletion.getByRole("status")).toBeInViewport();
  await expect(username).toBeFocused();
  await expect(username).toHaveValue("");
  await username.fill("me");
  await confirm.click();

  await expect(page).toHaveURL("/");
  await page.goto("/account");
  await expect(page.getByText("Log in to see your account.")).toBeVisible();
});

test("a wrong username is refused without sending the user to GitHub", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  // The username the page knows can be out of date, e.g. renamed elsewhere since it loaded.
  await page.route("**/user", (route) =>
    route.request().method() === "DELETE"
      ? route.fulfill({
          status: 403,
          json: { error: "The provided username doesn't match this account." }
        })
      : route.fallback()
  );
  await page.goto("/account");
  const deletion = page.getByRole("region", { name: "Delete account" });

  await deletion.getByRole("button", { name: "Delete account" }).click();
  await deletion.getByLabel("Username").fill("me");
  await deletion.getByRole("button", { name: "Delete account" }).click();

  await expect(deletion.getByRole("alert")).toHaveText(
    "The provided username doesn't match this account."
  );
  await expect(deletion.getByRole("link", { name: "Confirm with GitHub" })).toHaveCount(0);
  await expect(deletion.getByRole("button", { name: "Delete account" })).toBeVisible();
  await expect(deletion.getByLabel("Username")).toBeFocused();
});

test("coming back from GitHub without a delete under way is about the password", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account?github=linked");

  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set your password within 10 minutes."
  );
  const deletion = page.getByRole("region", { name: "Delete account" });
  await expect(deletion.getByLabel("Username")).toHaveCount(0);
  await expect(deletion.getByRole("button", { name: "Delete account" })).toBeVisible();
});

test("a delete cancelled after going to GitHub doesn't open again on the way back", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const deletion = page.getByRole("region", { name: "Delete account" });
  await deletion.getByRole("button", { name: "Delete account" }).click();
  await deletion.getByLabel("Username").fill("me");
  await deletion.getByRole("button", { name: "Delete account" }).click();

  // Opened in another tab, the link leaves this one here.
  const github = deletion.getByRole("link", { name: "Confirm with GitHub" });
  await github.evaluate((link) =>
    link.addEventListener("click", (event: Event) => event.preventDefault())
  );
  await github.click();
  await page.keyboard.press("Escape");
  await expect(deletion.getByLabel("Username")).toHaveCount(0);

  await page.goto("/account?github=linked");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set your password within 10 minutes."
  );
  await expect(deletion.getByLabel("Username")).toHaveCount(0);
});

test("a delete left on GitHub doesn't take over the password's own GitHub confirmation", async ({
  page,
  api
}) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const deletion = page.getByRole("region", { name: "Delete account" });
  await deletion.getByRole("button", { name: "Delete account" }).click();
  await deletion.getByLabel("Username").fill("me");
  await deletion.getByRole("button", { name: "Delete account" }).click();

  // Like Back from GitHub restoring the page as it was: the delete is still remembered.
  const github = deletion.getByRole("link", { name: "Confirm with GitHub" });
  await github.evaluate((link) =>
    link.addEventListener("click", (event: Event) => event.preventDefault())
  );
  await github.click();

  await page.getByLabel("New password").fill("correct horse battery");
  await page.getByLabel("Confirm password").fill("correct horse battery");
  await page.getByRole("button", { name: "Set password" }).click();
  await page
    .getByRole("region", { name: "Password", exact: true })
    .getByRole("link", { name: "Confirm with GitHub" })
    .click();

  await expect(page).toHaveURL("/account");
  await expect(page.getByRole("status")).toHaveText(
    "GitHub confirmed it's you. Set your password within 10 minutes."
  );
  await expect(deletion.getByLabel("Username")).toHaveCount(0);
});

test("a username typed to delete is forgotten once a password is set", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me", { githubLinked: true, password: false });
  await page.goto("/account");
  const newPassword = page.getByLabel("New password");
  const confirmPassword = page.getByLabel("Confirm password");
  await newPassword.fill("correct horse battery");
  await confirmPassword.fill("correct horse battery");
  await page.getByRole("button", { name: "Set password" }).click();
  await page.getByRole("link", { name: "Confirm with GitHub" }).click();
  await expect(page).toHaveURL("/account");

  const deletion = page.getByRole("region", { name: "Delete account" });
  await deletion.getByRole("button", { name: "Delete account" }).click();
  await deletion.getByLabel("Username").fill("me");
  const confirm = deletion.getByRole("button", { name: "Delete account" });
  await expect(confirm).toBeEnabled();

  await newPassword.fill("correct horse battery");
  await confirmPassword.fill("correct horse battery");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "Your password is set. You can log in with it from now on."
  );

  await expect(deletion.getByLabel("Password")).toHaveValue("");
  await expect(confirm).toBeDisabled();
  await deletion.getByLabel("Password").fill("correct horse battery");
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
  await expect(page.getByRole("alert")).toHaveText(
    "Too many failed attempts: try again later. Try again in 15 minutes."
  );
  const key = page.getByRole("button", { name: /^Try again in \d+ minutes$/ });
  await expect(key).toHaveText(/^Try again in \d+ min$/);
  await expect(key).toHaveAccessibleDescription("Too many failed attempts: try again later.");
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("Password")).toBeFocused();
  // The focused field is described by the message as shown too: the wait in words is the alert's.
  await expect(page.getByLabel("Password")).toHaveAccessibleDescription(
    "Too many failed attempts: try again later."
  );

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByLabel("Password")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();
});

test("Escape still closes the delete panel after a refused click", async ({ page, api }) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/account");

  await page.getByRole("button", { name: "Delete account" }).click();
  const password = page.getByLabel("Password");
  await password.fill("wrong-password");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(password).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(password).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete account" })).toBeFocused();
});
