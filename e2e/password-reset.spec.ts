import { expect, MOCK_EMAIL, MOCK_PASSWORD, test } from "./fixtures";

const SENT = "If an account uses this address, a password reset code was sent to it.";

test("a forgotten password is reset with the mailed code, then the user logs in", async ({
  page,
  api
}) => {
  api.hasUser("me");
  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page).toHaveURL("/reset-password");
  await expect(page.getByRole("heading", { level: 1, name: "Reset password" })).toBeVisible();

  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("status")).toHaveText(SENT);
  await expect(page.getByText("me@example.com", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Code")).toBeFocused();
  expect(api.passwordResets).toEqual(["me@example.com"]);

  await page.getByLabel("Code").fill("000000");
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The code is wrong, expired or already used: check it or request a new one."
  );

  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("main").getByRole("status")).toHaveText(
    "Password reset successfully: log in with the new password."
  );
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();

  // Logging in with the new password on the same page is an ordinary login.
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByLabel("Password", { exact: true }).fill("a new password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("main")).toContainText("Login successful!");
  await expect(page.getByRole("main")).not.toContainText("Password reset successfully");
});

test("the code can be sent again once the countdown ends, and the address changed", async ({
  page,
  api
}) => {
  await page.clock.install();
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("typo@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  await page.getByRole("button", { name: "Change" }).click();
  await expect(page.getByLabel("E-mail")).toBeFocused();
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  const resend = page.getByRole("button", { name: /^Send again/ });
  await expect(resend).toHaveText(/^Send again in \d+ sec$/);
  await expect(resend).toBeDisabled();

  // Back to the same address while the API wouldn't send another code: nothing is asked for.
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(resend).toBeDisabled();
  expect(api.passwordResets).toEqual(["typo@example.com", "me@example.com"]);

  await page.getByLabel("Code").fill("000000");
  await page.clock.runFor(60_000);
  await expect(resend).toHaveText("Send again");
  await resend.click();
  await expect(resend).toHaveText(/^Send again in \d+ sec$/);
  await expect(page.getByRole("status")).toHaveText(
    "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works."
  );
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(page.getByLabel("Code")).toHaveValue("");
  expect(api.passwordResets).toEqual(["typo@example.com", "me@example.com", "me@example.com"]);

  // Over the API's mail limit: its error shows, and the key waits as long as the limit says.
  await page.route("**/auth/password-reset", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 429,
          headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin },
          json: { error: "Too many e-mails requested: try again later.", retryAfter: 1800 }
        })
  );
  await page.clock.runFor(60_000);
  await resend.click();
  await expect(page.getByRole("alert")).toHaveText("Too many e-mails requested: try again later.");
  await expect(resend).toHaveText("Send again in 30 min");
  await expect(resend).toBeDisabled();
});

test("a code that already arrived is entered after a reload, without sending another", async ({
  page,
  api
}) => {
  api.hasUser("me");
  await page.clock.install();
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();

  // The API wouldn't send another code within the minute, so the countdown outlives the reload.
  await page.clock.runFor(20_000);
  await page.reload();
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Enter it" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();
  const resend = page.getByRole("button", { name: /^Send again/ });
  // About 40 seconds left: the clock keeps running while the page reloads.
  await expect(resend).toHaveText(/^Send again in [2-4]\d sec$/);
  await expect(resend).toBeDisabled();

  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  expect(api.passwordResets).toEqual(["me@example.com"]);
});

test("a resend over the mail limit is still explained after a reload, not taken for a recent code", async ({
  page,
  api
}) => {
  await page.clock.install();
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();
  await page.clock.runFor(60_000);
  api.limitsMailSends();

  await page.getByRole("button", { name: "Send again" }).click();
  const tooMany = "Too many e-mails requested: try again later.";
  await expect(page.getByRole("alert")).toHaveText(tooMany);
  const resend = page.getByRole("button", { name: /^Send again/ });
  await expect(resend).toHaveText("Send again in 57 min");
  await expect(resend).toHaveAccessibleName("Send again in 57 minutes");
  await expect(resend).toHaveAccessibleDescription(tooMany);
  expect(api.limitedPasswordResets).toEqual(["me@example.com"]);

  await page.reload();
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  // The wait is the mail limit's: no "sent in the last minute", and nothing new is asked for.
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(page.getByRole("alert")).toHaveText(tooMany);
  await expect(page.getByText("in the last minute")).toHaveCount(0);
  await expect(resend).toBeDisabled();
  // Neither sent nor refused: the mock saw no request after the reload.
  expect(api.passwordResets).toEqual(["me@example.com"]);
  expect(api.limitedPasswordResets).toEqual(["me@example.com"]);
});

test("a code only works for the address that asked for it", async ({ page, api }) => {
  api.hasUser("me");
  api.hasUser("someone");
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByLabel("E-mail").fill("someone@example.com");
  await page.getByRole("button", { name: "Enter it" }).click();

  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "The code is wrong, expired or already used: check it or request a new one."
  );
});

test("resetting the password logs out a user who was logged in", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("me@example.com", "me");
  await page.goto("/reset-password");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "me@example.com" })).toBeVisible();
  if (isMobile) await page.keyboard.press("Escape");

  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("link", { name: "me@example.com" })).toHaveCount(0);
});

test("resetting another account's password keeps the user logged in and says so", async ({
  page,
  api
}) => {
  api.loggedInAs("anna@example.com", "anna");
  api.hasUser("me");
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  const main = page.getByRole("main");
  await expect(main.getByRole("status")).toHaveText(
    "Password reset successfully: log in with the new password."
  );
  await expect(main).toContainText("You're still logged in as anna@example.com.");
  await expect(main).not.toContainText("Login successful!");

  await main.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
  await expect(main.getByRole("status")).toHaveText(
    "Password reset successfully: log in with the new password."
  );

  // Then logging in as the reset account shows the login, not the reset branch again.
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByLabel("Password", { exact: true }).fill("a new password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(main).toContainText("Login successful!");
  await expect(main).not.toContainText("You're still logged in");
});

test("a reset past the daily cap of wrong codes holds Reset password for hours", async ({
  page,
  api
}) => {
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();
  // Even the right code is refused once 20 were wrong today.
  api.capsCodeChecks();

  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Too many failed attempts: try again later. A new code won't help: no code is accepted for this address until the wait ends. Try again in 23 hours 45 minutes."
  );
  const key = page.getByRole("button", { name: /^Try again in/ });
  await expect(key).toHaveText(/^Try again in 23 hr \d+ min$/);
  // "23 hours" wouldn't contain the visible "23 hr", so the label names the key, and the message
  // it points at says the wait in words.
  await expect(key).toHaveAccessibleName(/^Try again in 23 hr \d+ min$/);
  await expect(key).toHaveAccessibleDescription(/Try again in 23 hours 45 minutes\.$/);
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(page).toHaveURL("/reset-password");
  expect(api.password).not.toBe("a new password");
});

test("asking for a code over the mail limit holds Send code for its wait", async ({
  page,
  api
}) => {
  await page.clock.install();
  api.limitsMailSends();
  await page.goto("/reset-password");
  await page.getByLabel("E-mail").fill("me@example.com");
  await page.getByRole("button", { name: "Send code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Too many e-mails requested: try again later. Try again in 57 minutes."
  );
  const key = page.locator("form").getByRole("button");
  await expect(key).toHaveText(/^Try again in \d+ min$/);
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("E-mail")).toBeFocused();
  expect(api.passwordResets).toEqual([]);

  // A jump, rather than every tick of the countdown on the way.
  await page.clock.fastForward(3_412_000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(key).toHaveText("Send code");
  await expect(key).toBeEnabled();
});

test.describe("the mailed link", () => {
  const RESET = "Password reset successfully: log in with the new password.";
  const BAD_LINK = "The reset link is wrong, expired or already used: request a new one.";

  test("asks only for the new password and drops the token from the address and history", async ({
    page,
    api
  }) => {
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);

    await expect(page).toHaveURL("/reset-password");
    await expect(page.getByLabel("New password")).toBeFocused();
    await expect(page.getByLabel("E-mail")).toHaveCount(0);
    await expect(page.getByLabel("Code")).toHaveCount(0);
    expect(await page.evaluate("JSON.stringify(history.state)")).not.toContain(token);

    // Leaving and coming back doesn't bring the token back either.
    await page.getByRole("main").getByRole("link", { name: "Log in", exact: true }).click();
    await expect(page).toHaveURL("/login");
    await page.goBack();
    await expect(page).toHaveURL("/reset-password");
    await expect(page.getByRole("button", { name: "Send code" })).toBeVisible();
  });

  test("reads a link opened in a tab already on the page, where only the fragment changes", async ({
    page,
    api
  }) => {
    await page.goto("/reset-password");
    await page.getByLabel("E-mail").fill("me@example.com");

    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);

    await expect(page).toHaveURL("/reset-password");
    await expect(page.getByLabel("New password")).toBeFocused();
    await expect(page.getByLabel("E-mail")).toHaveCount(0);
    expect(await page.evaluate("JSON.stringify(history.state)")).not.toContain(token);

    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page).toHaveURL("/login");
    expect(api.password).toBe("a new password");
  });

  test("sets the password once, then the user logs in with it", async ({ page, api }) => {
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);

    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("main").getByRole("status")).toHaveText(RESET);
    expect(api.password).toBe("a new password");

    // The old password no longer gets in; the new one does.
    await page.getByLabel("E-mail").fill(MOCK_EMAIL);
    await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("main")).toContainText("Incorrect e-mail address or password.");
    await page.getByLabel("Password", { exact: true }).fill("a new password");
    await page.getByRole("button", { name: "Log in", exact: true }).click();
    await expect(page.getByRole("main")).toContainText("Login successful!");

    // The link is used up.
    await page.goto(`/reset-password#token=${token}`);
    await page.getByLabel("New password").fill("another password");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert")).toHaveText(BAD_LINK);
    expect(api.password).toBe("a new password");
  });

  test("a link that doesn't work shows the API's error and leads to a new code", async ({
    page,
    api
  }) => {
    api.mailsResetLink();
    await page.goto(`/reset-password#token=${"0".repeat(24)}.${"x".repeat(43)}`);

    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page.getByRole("alert")).toHaveText(BAD_LINK);

    // Trying it again can't help: a new link is the one way on.
    await expect(page.getByLabel("New password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reset password" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request a new link" })).toBeFocused();
    await page.getByRole("button", { name: "Request a new link" }).click();
    await expect(page.getByLabel("E-mail")).toBeFocused();
    await expect(page.getByRole("main")).toContainText(
      "Enter your account's e-mail address to get a code and a link for a new password."
    );
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByLabel("E-mail").fill("me@example.com");
    await page.getByRole("button", { name: "Send code" }).click();
    await expect(page.getByRole("status")).toHaveText(SENT);
  });

  test("a password the API refuses keeps the link for another one", async ({ page, api }) => {
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);

    // An API whose password rule moved past the page's check: it answers like the double's length 400.
    const tooShort = "The password's too short: it must be between 8 and 128 characters.";
    await page.route("**/auth/password-reset/confirm-link", (route) =>
      route.request().method() === "OPTIONS"
        ? route.fallback()
        : route.fulfill({
            status: 400,
            headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin },
            json: { error: tooShort }
          })
    );
    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page.getByLabel("New password")).toBeFocused();
    await expect(page.getByLabel("New password")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText(tooShort)).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request a new link" })).toHaveCount(0);

    // The link wasn't used up: the double takes it with another password.
    await page.unroute("**/auth/password-reset/confirm-link");
    await page.getByLabel("New password").fill("a longer new password");
    await page.getByRole("button", { name: "Reset password" }).click();
    await expect(page).toHaveURL("/login");
    expect(api.password).toBe("a longer new password");
  });

  test("too many rejected links count the wait down on the key, and the link still works", async ({
    page,
    api
  }) => {
    await page.clock.install();
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);
    api.limitsResetLinks();

    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();

    // The wait in words at the end is for screen readers, as on every held key.
    const limited =
      "Too many failed attempts: try again later. The link wasn't used up: it works until 30 minutes after it was sent. Try again in 15 minutes.";
    await expect(page.getByRole("alert")).toHaveText(limited);
    const key = page.locator("form").getByRole("button");
    await expect(key).toHaveText("Try again in 15 min");
    await expect(key).toBeDisabled();
    await expect(key).toHaveAccessibleName("Try again in 15 minutes");
    await expect(key).toHaveAccessibleDescription(limited);
    await expect(page.getByLabel("New password")).toBeFocused();
    await expect(page.getByRole("main")).toContainText("Can't wait? Get a code instead");

    // Jumps to the end, as a tab left in the background would; the key counts from its deadline.
    await page.clock.fastForward(900_000);
    await expect(key).toHaveText("Reset password");
    await expect(key).toBeEnabled();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("main")).toContainText("Link not working? Request a new one");
    expect(api.password).toBe(MOCK_PASSWORD);
  });

  test("a malformed link falls back to the e-mail step without asking the API", async ({
    page,
    api
  }) => {
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token.slice(0, -5)}`);

    await expect(page).toHaveURL("/reset-password");
    await expect(page.getByRole("alert")).toHaveText(
      "This reset link isn't complete or was changed: request a new one."
    );
    await expect(page.getByLabel("E-mail")).toBeFocused();
    await expect(page.getByLabel("New password")).toHaveCount(0);
  });

  test("resetting with the link logs out the user it belongs to", async ({
    page,
    api,
    isMobile
  }) => {
    api.loggedInAs("me@example.com", "me");
    const token = api.mailsResetLink();
    await page.goto(`/reset-password#token=${token}`);
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "me@example.com" })).toBeVisible();
    if (isMobile) await page.keyboard.press("Escape");

    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Log in", exact: true })).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.getByRole("link", { name: "me@example.com" })).toHaveCount(0);
  });

  test("resetting another account's password with a link keeps the user logged in", async ({
    page,
    api
  }) => {
    api.loggedInAs("anna@example.com", "anna");
    const token = api.mailsResetLink("0123456789abcdef01234567", "me@example.com");
    await page.goto(`/reset-password#token=${token}`);
    await page.getByLabel("New password").fill("a new password");
    await page.getByRole("button", { name: "Reset password" }).click();

    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("main")).toContainText(
      "You're still logged in as anna@example.com."
    );
  });
});
