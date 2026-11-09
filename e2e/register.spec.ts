import type { Page } from "@playwright/test";
import { expect, REGISTRATION_CODE, test, type MockApi } from "./fixtures";

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
