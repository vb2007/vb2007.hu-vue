import type { Page } from "@playwright/test";
import { expect, REGISTRATION_CODE, test } from "./fixtures";

// Registering mails a code first (vb2007/vb2007.hu-api#28); the mock "mails" REGISTRATION_CODE.

const fillForm = async (page: Page, email = "new@example.com") => {
  await page.goto("/register");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Username").fill("newbie");
  await page.getByLabel("Password", { exact: true }).fill("correct horse");
  await page.getByLabel("Confirm password").fill("correct horse");
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

  await code.fill("654321");
  await page.getByRole("button", { name: "Confirm code" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "The code is wrong, expired or already used: check it or request a new one."
  );
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
    "A new code is on its way to new@example.com. The previous one no longer works."
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
  await page.getByLabel("E-mail").fill("new@example.com");
  await page.getByRole("button", { name: "Enter it" }).click();

  await expect(page.getByRole("status")).toContainText(
    "Enter the code that was mailed to new@example.com."
  );
  await expect(page.getByRole("button", { name: "Resend code" })).toBeEnabled();
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

test("entering a code needs the address first, without failing Register", async ({ page }) => {
  await page.goto("/register");

  await page.getByRole("button", { name: "Enter it" }).click();

  const email = page.getByLabel("E-mail");
  await expect(email).toHaveAccessibleDescription("Please enter a valid email address.");
  await expect(email).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Register", exact: true })).not.toHaveClass(
    /btn--error/
  );
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
