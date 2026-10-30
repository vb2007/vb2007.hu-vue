import { expect, test } from "./fixtures";

const SENT = "If an account uses this address, a password reset code was sent to it.";

test("a forgotten password is reset with the mailed code, then the user logs in", async ({
  page,
  api
}) => {
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
  await expect(resend).toHaveText("Send again in 1:00");
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
  await expect(resend).toHaveText("Send again in 1:00");
  await expect(page.getByRole("status")).toHaveText(
    "If an account uses this address, a new code is on its way, unless one was sent in the last minute: then the one before still works."
  );
  await expect(page.getByLabel("Code")).toBeFocused();
  await expect(page.getByLabel("Code")).toHaveValue("");
  expect(api.passwordResets).toEqual(["typo@example.com", "me@example.com", "me@example.com"]);

  // Over the API's mail limit: its error shows and the key waits again.
  await page.route("**/auth/password-reset", (route) =>
    route.request().method() === "OPTIONS"
      ? route.fallback()
      : route.fulfill({
          status: 429,
          headers: { "Access-Control-Allow-Origin": new URL(page.url()).origin },
          json: { error: "Too many e-mails requested: try again later." }
        })
  );
  await page.clock.runFor(60_000);
  await resend.click();
  await expect(page.getByRole("alert")).toHaveText("Too many e-mails requested: try again later.");
  await expect(resend).toHaveText("Send again in 1:00");
});

test("a code that already arrived is entered after a reload, without sending another", async ({
  page,
  api
}) => {
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
  await expect(resend).toHaveText(/^Send again in 0:[2-4]\d$/);
  await expect(resend).toBeDisabled();

  await page.getByLabel("Code").fill(api.passwordResetCode);
  await page.getByLabel("New password").fill("a new password");
  await page.getByRole("button", { name: "Reset password" }).click();

  await expect(page).toHaveURL("/login");
  expect(api.passwordResets).toEqual(["me@example.com"]);
});

test("a code only works for the address that asked for it", async ({ page, api }) => {
  api.passwordResets.push("me@example.com");
  await page.goto("/reset-password");
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
});
