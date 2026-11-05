import type { Page } from "@playwright/test";
import { expect, REGISTRATION_CODE, test } from "./fixtures";

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

test("a new code can be sent once a minute", async ({ page }) => {
  await page.clock.install();
  await fillForm(page);

  const resend = page.getByRole("button", { name: /^Resend/ });
  await expect(resend).toHaveText("Resend in 60 s");
  await expect(resend).toBeDisabled();

  await page.clock.runFor(60_000);
  await expect(resend).toHaveText("Resend code");
  await resend.click();

  await expect(page.getByRole("status")).toHaveText(
    "If a registration is waiting for new@example.com, a new code is on its way, and the one before no longer works."
  );
  await expect(resend).toHaveText("Resend in 60 s");
  await expect(resend).toBeDisabled();
});

test("a refused resend counts down from the API's retryAfter", async ({ page }) => {
  await page.route("**/auth/register/resend", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 429,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: {
            error: "A code was sent just now: wait 42 seconds before requesting another one.",
            retryAfter: 42
          }
        })
  );
  await page.clock.install();
  await fillForm(page);
  // The minute only starts once the code step is up.
  await expect(page.getByRole("button", { name: /^Resend in/ })).toBeDisabled();
  await page.clock.runFor(60_000);

  await page.getByRole("button", { name: "Resend code" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "A code was sent just now. You can send another once the countdown ends."
  );
  await expect(page.getByRole("button", { name: /^Resend/ })).toHaveText("Resend in 42 s");
  await expect(page.getByLabel("Confirmation code")).toBeFocused();

  await page.clock.runFor(42_000);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Resend code" })).toBeEnabled();
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
  await expect(page.getByRole("button", { name: /^Resend in \d+ s$/ })).toBeDisabled();
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
  await expect(page.getByRole("button", { name: /^Resend in \d+ s$/ })).toBeDisabled();
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
  await page.route("**/auth/register", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 400,
          headers: { "Access-Control-Allow-Origin": "*" },
          json: {
            error: "Disposable (temporary) e-mail addresses can't be used: use a permanent one."
          }
        })
  );

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
  await expect(page.getByRole("button", { name: /^Resend in \d+ s$/ })).toBeDisabled();
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
    "An account already uses this address. Log in instead (with GitHub if that's how you signed up), or reset the password from the log-in page."
  );
  await expect(email).toBeFocused();
  await expect(page.getByLabel("Confirmation code")).toHaveCount(0);
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
