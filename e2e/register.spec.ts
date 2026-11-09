import type { Page } from "@playwright/test";
import {
  callApi,
  expect,
  MAIL_FAILED_ERROR,
  MOCK_EMAIL,
  type MockApi,
  REGISTRATION_CODE,
  test
} from "./fixtures";

// Registering mails a code first (vb2007/vb2007.hu-api#28); the mock "mails" REGISTRATION_CODE.
// Confirming it creates the account with the form's username and password (vb2007/vb2007.hu-api#295).

const fillFields = async (page: Page, email = "new@example.com") => {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Username").fill("newbie");
  await page.getByLabel("Password", { exact: true }).fill("correct horse");
  await page.getByLabel("Confirm password").fill("correct horse");
};

const fillForm = async (page: Page, email = "new@example.com") => {
  await page.goto("/register");
  await fillFields(page, email);
  await page.getByRole("button", { name: "Register", exact: true }).click();
};

test("registering asks for the mailed code, then logs the new account in", async ({ page }) => {
  await fillForm(page);

  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "A 6-digit code is on its way to new@example.com."
  );
  const code = page.getByLabel("Confirmation code");
  await expect(code).toBeFocused();
  await expect(code).toHaveAttribute("autocomplete", "one-time-code");
  await expect(code).toHaveAttribute("inputmode", "numeric");

  const confirmKey = page.getByRole("button", { name: "Confirm code" });
  await code.fill("123");
  await expect(confirmKey).toHaveAttribute("aria-disabled", "true");
  await confirmKey.click({ force: true });
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(code).toHaveAccessibleDescription(/Enter the 6-digit code from the e-mail\./);
  await expect(confirmKey).toHaveClass(/btn--error/);

  await code.fill("654321");
  await confirmKey.click();
  // The code's own problem: on the field, not in a separate alert.
  await expect(code).toHaveAccessibleDescription(
    /The code is wrong, expired or already used: check it or request a new one\./
  );
  await expect(code).toHaveAttribute("aria-invalid", "true");
  await expect(confirmKey).toHaveClass(/btn--error/);
  await expect(page.getByRole("alert")).toHaveCount(0);
  // The key was disabled while it checked; focus is back on the code, not lost to the page.
  await expect(code).toBeFocused();

  await code.fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByText("Registration successful!")).toBeVisible();
  await expect(page.getByRole("status")).toBeFocused();
  await page.getByRole("link", { name: "Go to Shorten" }).click();
  await expect(page).toHaveURL("/shorten");
  await expect(page.getByLabel("URL")).toBeVisible();
});

test("a new code can be sent once a minute", async ({ page, api }) => {
  await page.clock.install();
  await fillForm(page);

  const resend = page.getByRole("button", { name: /^Resend/ });
  await expect(resend).toHaveText(/^Resend in \d+ sec$/);
  await expect(resend).toBeDisabled();

  await page.clock.runFor(60_000);
  // The API's minute runs out too, so it takes the resend.
  api.clockRunsFor(60_000);
  await expect(resend).toHaveText("Resend code");
  await resend.click();

  await expect(page.getByRole("status")).toHaveText(
    "If a registration is waiting for new@example.com, a new code is on its way, and the one before no longer works."
  );
  await expect(resend).toHaveText(/^Resend in \d+ sec$/);
  await expect(resend).toBeDisabled();
});

/** Answers `path` with the API's 429 carrying `json`, e.g. the code cooldown's. */
const refuse = (page: Page, path: string, json: { error: string; retryAfter: number }) =>
  page.route(`**${path}`, (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({ status: 429, headers: { "Access-Control-Allow-Origin": "*" }, json })
  );

test("a refused resend counts down from the API's retryAfter", async ({ page }) => {
  await refuse(page, "/auth/register/resend", {
    error: "A code was sent just now: wait 42 seconds before requesting another one.",
    retryAfter: 42
  });
  await page.clock.install();
  await fillForm(page);
  // The minute only starts once the code step is up.
  await expect(page.getByRole("button", { name: /^Resend in/ })).toBeDisabled();
  await page.clock.runFor(60_000);

  await page.getByRole("button", { name: "Resend code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A code was sent just now. You can send another once the countdown ends."
  );
  await expect(page.getByRole("button", { name: /^Resend/ })).toHaveText(/^Resend in [1-4]\d sec$/);
  await expect(page.getByLabel("Confirmation code")).toBeFocused();

  await page.clock.runFor(42_000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resend code" })).toBeEnabled();
});

test("a resend over the mail limit shows the API's message and counts its wait in minutes", async ({
  page,
  api
}) => {
  await page.clock.install();
  await fillForm(page);
  await expect(page.getByRole("button", { name: /^Resend in/ })).toBeDisabled();
  await page.clock.runFor(60_000);
  // The first code went out; the next one is over the limit.
  api.limitsMailSends();

  await page.getByRole("button", { name: "Resend code" }).click();

  await expect(page.getByRole("alert")).toHaveText("Too many e-mails requested: try again later.");
  await expect(page.getByRole("button", { name: /^Resend/ })).toHaveText("Resend in 57 min");
  await expect(page.getByRole("button", { name: /^Resend/ })).toHaveAccessibleName(
    "Resend in 57 minutes"
  );
  await expect(page.getByRole("button", { name: /^Resend/ })).toBeDisabled();

  // After a reload, the wait it picks up still says why.
  await page.reload();
  await fillFields(page);
  await page.getByRole("button", { name: "Enter it" }).click();
  await expect(page.getByRole("alert")).toHaveText("Too many e-mails requested: try again later.");
  await expect(page.getByRole("button", { name: /^Resend/ })).toHaveText("Resend in 57 min");
});

test("registering over the mail limit stays on the form, since no code was sent", async ({
  page,
  api
}) => {
  api.limitsMailSends();
  await fillForm(page);

  await expect(page.getByRole("alert")).toHaveText(
    "Too many e-mails requested: try again later. Try again in 57 minutes."
  );
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  await expect(page.getByText(/a code went to/)).toHaveCount(0);
  await expect(page.getByLabel("E-mail")).toHaveValue("new@example.com");
  // The limit is per IP, so Register waits it out whatever the address.
  const key = page.locator("form").getByRole("button", { name: /^(Register|Try again)/ });
  await expect(key).toHaveText(/^Try again in \d+ min$/);
  await expect(key).toHaveAccessibleDescription("Too many e-mails requested: try again later.");
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("E-mail")).toBeFocused();
});

test("a code past the daily cap of wrong codes holds Confirm code for hours", async ({
  page,
  api
}) => {
  await fillForm(page);
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
  // Even the right code is refused once 20 were wrong today.
  api.capsCodeChecks();

  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Too many failed attempts: try again later. A new code won't help: no code is accepted for this address until the wait ends. Try again in 23 hours 45 minutes."
  );
  const key = page.getByRole("button", { name: /^Try again in/ });
  await expect(key).toHaveText(/^Try again in 23 hr \d+ min$/);
  // "23 hours" wouldn't contain the visible "23 hr", so the label names the key, and the alert says
  // the wait in words. The key is described by the message as shown, so it states one wait.
  await expect(key).toHaveAccessibleName(/^Try again in 23 hr \d+ min$/);
  await expect(key).toHaveAccessibleDescription(
    "Too many failed attempts: try again later. A new code won't help: no code is accepted for this address until the wait ends."
  );
  await expect(key).toBeDisabled();
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
  await expect(page.getByText("Registration successful!")).toHaveCount(0);
});

test("username checks over the API's limit stop quietly until its wait passed", async ({
  page,
  api
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.clock.install();
  api.limitsUsernameChecks();
  api.hasUser("anna4");
  await page.goto("/register");
  const username = page.getByLabel("Username");
  const registerKey = page.getByRole("button", { name: "Register", exact: true });

  const limited = page.waitForResponse((response) =>
    response.url().includes("/auth/username-available")
  );
  await username.fill("anna");
  await page.clock.runFor(500);
  // The 429 has to arrive before the next typing, which would abort a check still on its way.
  await (await limited).finished();
  expect(api.usernameChecks).toBe(1);
  // The 429 says nothing: the name is just unknown, which registering still checks.
  await expect(username).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Within the wait, nothing more is asked.
  await username.fill("anna2");
  await page.clock.runFor(500);
  expect(api.usernameChecks).toBe(1);
  await expect(username).not.toHaveAttribute("aria-invalid", "true");

  api.limitsUsernameChecks(false);
  await page.clock.runFor(42_000);
  await username.fill("anna4");
  await page.clock.runFor(500);
  await expect(username).toHaveAccessibleDescription("That username is taken: pick another one.");
  await expect(registerKey).toHaveAttribute("aria-disabled", "true");
  expect(api.usernameChecks).toBe(2);
  // The expected 429 isn't logged as an error (the browser's own failed-request line aside).
  expect(errors.filter((error) => error.includes("username"))).toEqual([]);
});

test("a code that already arrived can be entered after a reload", async ({ page }) => {
  await fillForm(page);
  await expect(page.getByLabel("Confirmation code")).toBeVisible();

  await page.reload();
  // The form is empty again, and confirming needs its username and password too.
  await fillFields(page);
  await page.getByRole("button", { name: "Enter it" }).click();

  await expect(page.getByRole("status")).toHaveText(
    "Enter the code that was mailed to new@example.com. It works for 15 minutes after sending, and registers you as newbie with the password you entered."
  );
  // The minute since the code was sent survives the reload, so no click is wasted on a 429.
  await expect(page.getByRole("button", { name: /^Resend in \d+ seconds?$/ })).toBeDisabled();
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByText("Registration successful!")).toBeVisible();
});

test("registering the same address again within the minute keeps the code sent", async ({
  page
}) => {
  await fillForm(page);
  await page.getByRole("button", { name: "Change address" }).click();

  await page.getByRole("button", { name: "Register", exact: true }).click();

  await expect(page.getByRole("status")).toContainText(
    "Less than a minute ago, a code went to new@example.com. It still works"
  );
  await expect(page.getByRole("button", { name: /^Resend in \d+ seconds?$/ })).toBeDisabled();
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByText("Registration successful!")).toBeVisible();
});

test("a mistyped address can be fixed from the code step", async ({ page }) => {
  await fillForm(page, "new@exmaple.com");
  await expect(page.getByRole("status")).toContainText("new@exmaple.com");

  await page.getByRole("button", { name: "Change address" }).click();

  const email = page.getByLabel("E-mail");
  await expect(email).toBeFocused();
  await expect(email).toHaveValue("new@exmaple.com");
  await expect(page.getByLabel("Username")).toHaveValue("newbie");
  await email.fill("new@example.com");
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await expect(page.getByRole("status")).toContainText("on its way to new@example.com.");
});

test("the API's reason for refusing an address is shown on the form", async ({ page }) => {
  // The mock refuses a disposable domain like the API does.
  await fillForm(page, "someone@mailinator.com");

  // It's about the address, so it shows under the E-mail field, which takes focus.
  const email = page.getByLabel("E-mail");
  await expect(email).toHaveAccessibleDescription(
    "Disposable (temporary) e-mail addresses can't be used: use a permanent one."
  );
  await expect(email).toHaveAttribute("aria-invalid", "true");
  await expect(email).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
});

test("a taken username is shown at the Username field, which takes focus", async ({ page }) => {
  await page.route("**/auth/register", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 409,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: { error: "This username is already taken." }
        })
  );

  await fillForm(page);

  const username = page.getByLabel("Username");
  await expect(username).toHaveAccessibleDescription("This username is already taken.");
  await expect(username).toBeFocused();

  await username.fill("someone-else");
  await expect(username).not.toHaveAttribute("aria-invalid", "true");
});

test("entering a code needs the whole form first, without failing Register", async ({ page }) => {
  await page.goto("/register");

  await page.getByRole("button", { name: "Enter it" }).click();

  const email = page.getByLabel("E-mail");
  await expect(email).toHaveAccessibleDescription("Enter a valid e-mail address.");
  await expect(page.getByLabel("Username")).toHaveAccessibleDescription(
    "The username's too short: it must be between 2 and 16 characters."
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveAccessibleDescription(
    /The password's too short/
  );
  await expect(email).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Register", exact: true })).not.toHaveClass(
    /btn--error/
  );
});

test("a username taken meanwhile keeps the code, which finishes with another name", async ({
  page,
  api
}) => {
  await fillForm(page);
  await expect(page.getByLabel("Confirmation code")).toBeVisible();
  // Waiting registrations don't hold a name: someone else takes it before the code is entered.
  api.hasUser("Newbie");

  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  const username = page.getByLabel("Username");
  await expect(username).toHaveAccessibleDescription(
    "That username was taken in the meantime: pick another one. Your code works for up to 15 minutes after it was sent."
  );
  await expect(username).toBeFocused();
  await expect(page.getByLabel("E-mail")).toHaveValue("new@example.com");

  await username.fill("newbie2");
  // The key says it goes on rather than registering again.
  await page.getByRole("button", { name: "Continue", exact: true }).click();

  // No new code is mailed: the step comes back with the one typed before and its countdown.
  await expect(page.getByRole("status")).toHaveText(
    "Your code for new@example.com works for up to 15 minutes after it was sent: confirm it to register as newbie2."
  );
  await expect(page.getByLabel("Confirmation code")).toHaveValue(REGISTRATION_CODE);
  await expect(page.getByLabel("Confirmation code")).toBeFocused();
  await expect(page.getByRole("button", { name: /^Resend in \d+ seconds?$/ })).toBeDisabled();
  await page.getByRole("button", { name: "Confirm code" }).click();

  await expect(page.getByText("Registration successful!")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByText("newbie2", { exact: true })).toBeVisible();
});

test("an address that already has an account is only refused at the code", async ({
  page,
  api
}) => {
  api.hasUser("anna");

  // Registering answers like for any address, so it doesn't reveal which ones have accounts.
  await fillForm(page, "anna@example.com");
  await expect(page.getByRole("status")).toContainText("on its way to anna@example.com.");
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();

  const email = page.getByLabel("E-mail");
  await expect(email).toHaveAccessibleDescription(
    "An account already uses this address. Log in instead (with GitHub if that's how you signed up), or reset the password."
  );
  await expect(email).toBeFocused();
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  // The two actions the message names are links in it.
  const field = page.locator(".field", { has: email });
  await expect(field.getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(field.getByRole("link", { name: "reset the password" })).toBeVisible();
});

test("an address only the login knows is refused at the code too", async ({ page }) => {
  // MOCK_EMAIL's account: nobody is logged in to it and the admin list doesn't hold it.
  await fillForm(page, MOCK_EMAIL);
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  const verified = page.waitForResponse((response) =>
    response.url().includes("/auth/register/verify")
  );
  await page.getByRole("button", { name: "Confirm code" }).click();

  expect((await verified).status()).toBe(409);
  await expect(page.getByLabel("E-mail")).toHaveAccessibleDescription(
    "An account already uses this address. Log in instead (with GitHub if that's how you signed up), or reset the password."
  );
  await expect(page.getByText("Registration successful!")).toHaveCount(0);
});

/** Registers with an address that has an account, and lands back on the form with the message. */
const refusedAsExisting = async (page: Page, api: MockApi) => {
  api.hasUser("anna");
  await fillForm(page, " anna@example.com ");
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByLabel("E-mail")).toBeFocused();
};

test("the message for an address with an account links to Log in, address filled in", async ({
  page,
  api
}) => {
  await refusedAsExisting(page, api);

  await page.locator(".field").getByRole("link", { name: "Log in" }).click();

  // The address travels in the history state, never in the URL.
  await expect(page).toHaveURL("/login");
  await expect(page.getByLabel("E-mail")).toHaveValue("anna@example.com");
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("E-mail")).not.toHaveAttribute("aria-invalid", "true");
  expect(await page.evaluate("location.search + location.hash")).toBe("");
  expect(await page.evaluate("history.state.prefillEmail")).toBe("anna@example.com");

  // Reloading keeps it; a page opened any other way starts empty.
  await page.reload();
  await expect(page.getByLabel("E-mail")).toHaveValue("anna@example.com");
  await page.goto("/shorten");
  await page.goto("/login");
  await expect(page.getByLabel("E-mail")).toHaveValue("");
});

test("the link to Log in lets the user log in with the address it carried", async ({
  page,
  api
}) => {
  await refusedAsExisting(page, api);

  await page.locator(".field").getByRole("link", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();
  await page.getByLabel("Password", { exact: true }).fill(api.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await expect(page.getByRole("main")).toContainText("Login successful!");
});

test("the link to reset the password opens Reset password with the address filled in", async ({
  page,
  api
}) => {
  await refusedAsExisting(page, api);

  await page.locator(".field").getByRole("link", { name: "reset the password" }).click();

  await expect(page).toHaveURL("/reset-password");
  await expect(page.getByLabel("E-mail")).toHaveValue("anna@example.com");
  // Sending a code stays the user's call.
  await expect(page.getByRole("button", { name: "Send code" })).not.toBeFocused();
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByLabel("Code")).toBeFocused();
  expect(api.passwordResets).toEqual(["anna@example.com"]);
});

test("editing the address takes the message and its links away", async ({ page, api }) => {
  await refusedAsExisting(page, api);
  const field = page.locator(".field", { has: page.getByLabel("E-mail") });

  await page.getByLabel("E-mail").fill("anna2@example.com");

  await expect(field.getByRole("link")).toHaveCount(0);
  await expect(page.getByLabel("E-mail")).not.toHaveAttribute("aria-invalid", "true");
});

test("logging out after registering leaves an empty form", async ({ page, isMobile }) => {
  await fillForm(page);
  await page.getByLabel("Confirmation code").fill(REGISTRATION_CODE);
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByText("Registration successful!")).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();

  await expect(page.getByLabel("E-mail")).toHaveValue("");
  await expect(page.getByLabel("Username")).toHaveValue("");
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Confirm password")).toHaveValue("");
});

test("each field is checked once it's left, and the key looks disabled until all pass", async ({
  page
}) => {
  await page.goto("/register");
  const key = page.getByRole("button", { name: "Register", exact: true });
  const email = page.getByLabel("E-mail");
  const password = page.getByLabel("Password", { exact: true });
  await expect(key).toHaveAttribute("aria-disabled", "true");

  await email.fill("new@");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");
  await page.keyboard.press("Tab");
  await expect(email).toHaveAccessibleDescription("Enter a valid e-mail address.");

  // Once shown, the problem goes as soon as it's fixed.
  await email.fill("new@example.com");
  await expect(email).not.toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Username").fill("newbie");
  await password.fill("short");
  await page.getByLabel("Confirm password").focus();
  await expect(password).toHaveAccessibleDescription(
    "The password's too short: it must be between 8 and 128 characters."
  );

  // Pressing the key anyway puts the cursor where the problem is.
  await key.click({ force: true });
  await expect(password).toBeFocused();
  await expect(key).toHaveClass(/btn--error/);

  await password.fill("correct horse");
  await page.getByLabel("Confirm password").fill("correct horse");
  await expect(key).not.toHaveAttribute("aria-disabled");
});

test("a taken username is said while it's typed", async ({ page, api }) => {
  api.hasUser("Anna");
  await page.goto("/register");
  const username = page.getByLabel("Username");

  await username.fill("anna");
  await expect(username).toHaveAccessibleDescription("That username is taken: pick another one.");
  await expect(page.getByRole("button", { name: "Register", exact: true })).toHaveAttribute(
    "aria-disabled",
    "true"
  );

  await username.fill("anna2");
  await expect(username).not.toHaveAttribute("aria-invalid", "true");
});

test("the name of an account nobody is logged in to is taken too", async ({ page }) => {
  await page.goto("/register");
  const username = page.getByLabel("Username");
  const checked = page.waitForResponse((response) =>
    response.url().includes("/auth/username-available")
  );

  // MOCK_EMAIL's account, which only the login knows.
  await username.fill("e2e");

  expect(await (await checked).json()).toEqual({ available: false });
  await expect(username).toHaveAccessibleDescription("That username is taken: pick another one.");
});

const USERNAME_INVALID =
  "The username has invalid characters: it can't contain invisible or control characters, or whitespace other than spaces.";

test("a username with an invisible character or a tab is refused while it's typed, without asking the API", async ({
  page,
  api
}) => {
  await page.clock.install();
  await page.goto("/register");
  const username = page.getByLabel("Username");
  const registerKey = page.getByRole("button", { name: "Register", exact: true });

  for (const name of ["anna\u200bb", "anna\tb"]) {
    await username.fill(name);
    await page.clock.runFor(500);
    await expect(username).toHaveAccessibleDescription(USERNAME_INVALID);
    await expect(registerKey).toHaveAttribute("aria-disabled", "true");
  }
  expect(api.usernameChecks).toBe(0);

  // Spaces, and whitespace at the ends, which is trimmed, are fine.
  await username.fill("\tanna b ");
  await page.clock.runFor(500);
  await expect(username).not.toHaveAttribute("aria-invalid", "true");
  await expect.poll(() => api.usernameChecks).toBe(1);
});

test("the double refuses a username with an invisible character like the API", async ({
  page,
  api
}) => {
  await page.goto("/register");
  await expect.poll(() => api.apiOrigin).not.toBe("");
  const refused = { status: 400, body: { error: USERNAME_INVALID } };
  const name = "anna\u200b";

  const available = await page.evaluate(
    async (url) => (await fetch(url)).status,
    `${api.apiOrigin}/auth/username-available?username=${encodeURIComponent(name)}`
  );
  expect(available).toBe(400);
  expect(
    await callApi(page, api, "POST", "/auth/register", { ...REGISTRATION, username: name })
  ).toEqual(refused);
  expect(
    await callApi(page, api, "POST", "/auth/register/verify", {
      ...REGISTRATION,
      username: name,
      code: REGISTRATION_CODE
    })
  ).toEqual(refused);

  // A username that isn't a string is a missing one, like the API's.
  expect(
    await callApi(page, api, "POST", "/auth/register", { ...REGISTRATION, username: 42 })
  ).toEqual({
    status: 400,
    body: { error: "You must provide a username, E-mail address, and a password." }
  });
  expect(
    await callApi(page, api, "POST", "/auth/register/verify", {
      ...REGISTRATION,
      username: 42,
      code: REGISTRATION_CODE
    })
  ).toEqual({
    status: 400,
    body: {
      error: "You must provide an E-mail address, the confirmation code, a username and a password."
    }
  });
});

// The double's mail failures, checked through the page's own calls: the form can't wait out the API's
// minute between a registration and its failed re-registration, but the double's clock can.

const REGISTRATION = { email: "new@example.com", username: "newbie", password: "correct horse" };
const WRONG_CODE = {
  status: 400,
  body: { error: "The code is wrong, expired or already used: check it or request a new one." }
};
const MAIL_FAILED = { status: 503, body: { error: MAIL_FAILED_ERROR } };
const REGISTERED = {
  status: 201,
  body: { message: "User newbie registered successfully." }
};

/** Opens the page, so the double knows the API's origin, then registers `REGISTRATION` and moves the double's clock past the minute. */
const registerAndWait = async (page: Page, api: MockApi) => {
  await page.goto("/register");
  const registered = await callApi(page, api, "POST", "/auth/register", REGISTRATION);
  expect(registered.status).toBe(202);
  api.clockRunsFor(60_000);
};

const verify = (page: Page, api: MockApi) =>
  callApi(page, api, "POST", "/auth/register/verify", { ...REGISTRATION, code: REGISTRATION_CODE });

test("a registration whose code couldn't be mailed says so and leaves nothing behind", async ({
  page,
  api
}) => {
  api.failsNextMail();
  await fillForm(page);

  await expect(page.getByRole("alert")).toHaveText(MAIL_FAILED_ERROR);
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
  // Nothing waits, so no cooldown holds back another try.
  expect(await verify(page, api)).toEqual(WRONG_CODE);
  await page.getByRole("button", { name: "Register", exact: true }).click();

  await expect(page.getByLabel("Confirmation code")).toBeFocused();
});

test("a registration whose code couldn't be mailed keeps the one that waited", async ({
  page,
  api
}) => {
  await registerAndWait(page, api);
  api.failsNextMail();

  const failed = await callApi(page, api, "POST", "/auth/register", {
    ...REGISTRATION,
    username: "another"
  });

  expect(failed).toEqual(MAIL_FAILED);
  expect(await verify(page, api)).toEqual(REGISTERED);
});

test("a resend whose code couldn't be mailed answers 200 and keeps the code sent before", async ({
  page,
  api
}) => {
  await registerAndWait(page, api);
  api.failsNextMail();

  const failed = await callApi(page, api, "POST", "/auth/register/resend", {
    email: REGISTRATION.email
  });
  // The code before is the one from a minute ago, so a resend goes at once instead of meeting a cooldown.
  const again = await callApi(page, api, "POST", "/auth/register/resend", {
    email: REGISTRATION.email
  });

  expect(failed.status).toBe(200);
  expect(again).toEqual(failed);
  expect(await verify(page, api)).toEqual(REGISTERED);
});

test("a resend for an address nobody waits on sends no mail, so a failure is left for the next one", async ({
  page,
  api
}) => {
  await registerAndWait(page, api);
  api.failsNextMail();

  const nobody = await callApi(page, api, "POST", "/auth/register/resend", {
    email: "nobody@example.com"
  });
  const registration = await callApi(page, api, "POST", "/auth/register", {
    ...REGISTRATION,
    email: "other@example.com"
  });

  expect(nobody.status).toBe(200);
  expect(registration).toEqual(MAIL_FAILED);
});

test("once the day's registration mails are used up, a resend answers 503 before it looks at the address", async ({
  page,
  api
}) => {
  await registerAndWait(page, api);
  api.sentMailToday(200);

  const waiting = await callApi(page, api, "POST", "/auth/register/resend", {
    email: REGISTRATION.email
  });
  const unknown = await callApi(page, api, "POST", "/auth/register/resend", {
    email: "nobody@example.com"
  });
  const registering = await callApi(page, api, "POST", "/auth/register", {
    ...REGISTRATION,
    email: "other@example.com"
  });

  expect([waiting, unknown, registering]).toEqual([MAIL_FAILED, MAIL_FAILED, MAIL_FAILED]);
  // The code sent before is untouched.
  expect(await verify(page, api)).toEqual(REGISTERED);
});

test("a sign-up code still goes out one mail short of the registration share", async ({
  page,
  api
}) => {
  await page.goto("/register");
  api.sentMailToday(199);

  const registered = await callApi(page, api, "POST", "/auth/register", REGISTRATION);

  expect(registered.status).toBe(202);
});

const RESENT = {
  status: 200,
  body: {
    message:
      "If a registration is waiting for this address, a confirmation code was sent to it in the last minute or just now: use the latest one."
  }
};
const resend = (page: Page, api: MockApi, body: unknown = { email: REGISTRATION.email }) =>
  callApi(page, api, "POST", "/auth/register/resend", body);

test("a resend inside the minute answers 200 like any other and sends nothing", async ({
  page,
  api
}) => {
  await page.goto("/register");
  expect((await callApi(page, api, "POST", "/auth/register", REGISTRATION)).status).toBe(202);
  api.clockRunsFor(30_000);

  // The API answers before it looks, so this is also the answer of an address nobody waits on.
  expect(await resend(page, api)).toEqual(RESENT);
  expect(await resend(page, api, { email: "nobody@example.com" })).toEqual(RESENT);
  api.clockRunsFor(30_000);

  // No new code started a minute of its own: the registration's runs out 60 seconds after it was made.
  const again = await callApi(page, api, "POST", "/auth/register", REGISTRATION);
  expect(again.status).toBe(202);
});

test("a resend without an address answers 400 before anything else", async ({ page, api }) => {
  await registerAndWait(page, api);
  api.sentMailToday(250);
  const missing = { status: 400, body: { error: "You must provide an E-mail address." } };

  expect(await resend(page, api, {})).toEqual(missing);
  expect(await resend(page, api, { email: "" })).toEqual(missing);
  expect(await resend(page, api, { email: 42 })).toEqual(missing);
  // With an address, the used-up budget answers.
  expect(await resend(page, api)).toEqual(MAIL_FAILED);
});

test("every resend uses up a mail of the day, whatever the address or the answer", async ({
  page,
  api
}) => {
  await registerAndWait(page, api);
  api.sentMailToday(197);

  // A waiting registration, an address nobody waits on, and a code that can't be mailed: one each.
  expect(await resend(page, api)).toEqual(RESENT);
  expect(await resend(page, api, { email: "nobody@example.com" })).toEqual(RESENT);
  api.clockRunsFor(60_000);
  api.failsNextMail();
  expect(await resend(page, api)).toEqual(RESENT);

  // 200 of the registration share's 200 are used up.
  const other = await callApi(page, api, "POST", "/auth/register", {
    ...REGISTRATION,
    email: "other@example.com"
  });
  expect(other).toEqual(MAIL_FAILED);
  expect(await resend(page, api)).toEqual(MAIL_FAILED);
});

test("mail to a reserved top-level domain is neither counted nor failed", async ({ page, api }) => {
  await page.goto("/register");
  api.sentMailToday(199);

  // The domain is what follows the @: `localhost` has no dot of its own.
  expect(await resend(page, api, { email: "nobody@localhost" })).toEqual(RESENT);
  const reserved = { ...REGISTRATION, email: "new@mail.test" };
  expect((await callApi(page, api, "POST", "/auth/register", reserved)).status).toBe(202);
  api.clockRunsFor(60_000);
  api.failsNextMail();
  // The API only logs this mail, so nothing fails it and the failure waits for the next real one.
  expect(await resend(page, api, { email: reserved.email })).toEqual(RESENT);

  // Nothing above counted: this is the 200th mail, and the one that meets the failure.
  const other = { ...REGISTRATION, email: "other@example.com" };
  expect(await callApi(page, api, "POST", "/auth/register", other)).toEqual(MAIL_FAILED);
  expect((await callApi(page, api, "POST", "/auth/register", other)).status).toBe(202);
});

test("a registration code counts against the day's mails", async ({ page, api }) => {
  await page.goto("/register");
  api.sentMailToday(198);

  for (const email of ["a@example.com", "b@example.com"]) {
    const sent = await callApi(page, api, "POST", "/auth/register", { ...REGISTRATION, email });
    expect(sent.status).toBe(202);
  }

  expect(await callApi(page, api, "POST", "/auth/register", REGISTRATION)).toEqual(MAIL_FAILED);
});

test("a registration code that couldn't be mailed gives its mail of the day back", async ({
  page,
  api
}) => {
  await page.goto("/register");
  api.sentMailToday(199);
  api.failsNextMail();

  expect(await callApi(page, api, "POST", "/auth/register", REGISTRATION)).toEqual(MAIL_FAILED);

  // Kept, the failed one would have been the 200th and this code refused.
  const again = await callApi(page, api, "POST", "/auth/register", REGISTRATION);
  expect(again.status).toBe(202);
  // This one counts: the registration share is used up now.
  const other = await callApi(page, api, "POST", "/auth/register", {
    ...REGISTRATION,
    email: "other@example.com"
  });
  expect(other).toEqual(MAIL_FAILED);
});
