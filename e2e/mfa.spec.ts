import type { Page } from "@playwright/test";
import {
  expect,
  MFA_EXPIRED_ERROR,
  MOCK_EMAIL,
  MOCK_MFA_CODE,
  MOCK_MFA_LINK_TOKEN,
  MOCK_NEW_RECOVERY_CODES,
  MOCK_PASSWORD,
  MOCK_RECOVERY_CODES,
  test
} from "./fixtures";

/** Logs in with the password of `MOCK_EMAIL`, whose account has e-mail MFA on. */
async function passPassword(page: Page) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E-mail code" })).toBeVisible();
}

test("a password login asks for the mailed code, which logs in", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);
  const main = page.getByRole("main");
  await expect(main.getByText("One more step: confirm it's you")).toBeFocused();
  await expect(main.getByLabel("Password")).toHaveCount(0);

  await main.getByRole("button", { name: "E-mail me a code" }).click();
  const code = main.getByLabel("Code from the e-mail");
  await expect(code).toBeFocused();
  await expect(main.getByRole("status")).toContainText("open the link in this browser");

  await code.fill("000000");
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(code).toHaveAccessibleDescription(/The code is wrong, expired or already used/);
  await expect(code).toBeFocused();

  await code.fill(MOCK_MFA_CODE);
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(main.getByText("Login successful!")).toBeVisible();
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
});

test("the mailed link logs in, and leaves the address bar", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);
  await page.getByRole("button", { name: "E-mail me a code" }).click();
  await expect(page.getByLabel("Code from the e-mail")).toBeFocused();

  await page.goto(`/login/mfa#token=${MOCK_MFA_LINK_TOKEN}`);

  await expect(page.getByRole("status").filter({ hasText: "Login successful!" })).toBeFocused();
  expect(new URL(page.url()).hash).toBe("");
  await expect(page).toHaveTitle(/^Log in/);

  // Opened again, the used-up link finds this browser logged in.
  await page.goto(`/login/mfa#token=${MOCK_MFA_LINK_TOKEN}`);
  await expect(page.getByText("Login successful!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in again" })).toHaveCount(0);
});

test("the link opened in another tab logs the step's tab in once it's back", async ({
  isMobile,
  page,
  api
}) => {
  api.hasMfaEmail();
  await passPassword(page);
  await page.getByRole("button", { name: "E-mail me a code" }).click();
  await expect(page.getByLabel("Code from the e-mail")).toBeFocused();

  // Like a mail app opening the link in a new tab of the same browser.
  const appOrigin = new URL(page.url()).origin;
  const mailTab = await page.context().newPage();
  await mailTab.route(
    (url) => url.origin !== appOrigin,
    (route) => api.handle(route, appOrigin)
  );
  await mailTab.goto(`/login/mfa#token=${MOCK_MFA_LINK_TOKEN}`);
  await expect(mailTab.getByText("Login successful!")).toBeVisible();

  await page.bringToFront();
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await expect(page.getByText("Login successful!")).toBeVisible();

  // The step is gone for good: logging out brings back the password form.
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E-mail code" })).toHaveCount(0);
});

test("a new login within the minute says the earlier code doesn't work, and offers no field", async ({
  page,
  api
}) => {
  api.hasMfaEmail();
  await passPassword(page);
  await page.getByRole("button", { name: "E-mail me a code" }).click();
  await expect(page.getByLabel("Code from the e-mail")).toBeVisible();
  await page.getByRole("button", { name: "Log in again" }).click();

  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.getByRole("button", { name: "E-mail me a code" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "for an earlier login, and it doesn't work for this one"
  );
  await expect(page.getByRole("alert")).toBeFocused();
  await expect(page.getByLabel("Code from the e-mail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Send again in/ })).toBeDisabled();
});

test("back from GitHub with ?mfa=required, the step opens with its methods", async ({
  page,
  api
}) => {
  api.hasMfaEmail();
  api.waitsForGithubMfa();

  await page.goto("/login?mfa=required");

  await expect(page.getByRole("heading", { name: "E-mail code" })).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
});

test("back from GitHub after the step expired, its message takes the focus", async ({ page }) => {
  await page.goto("/login?mfa=required");

  const message = page.getByRole("alert");
  await expect(message).toHaveText(MFA_EXPIRED_ERROR);
  await expect(message).toBeFocused();
});

test("a refused link says so, with the way back to Log in", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);

  await page.goto("/login/mfa#token=not-the-token");

  await expect(page.getByRole("alert")).toContainText("The login link is wrong");
  await page.getByRole("link", { name: "Log in again" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("an expired step goes back to the password with its message", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);
  api.expiresMfaChallenge();

  await page.getByRole("button", { name: "E-mail me a code" }).click();

  await expect(page.getByRole("alert")).toHaveText(MFA_EXPIRED_ERROR);
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("E-mail")).toHaveValue(MOCK_EMAIL);
});

test("Log in again leaves the step for the password form", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);

  await page.getByRole("button", { name: "Log in again" }).click();

  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
  // A fresh form: nothing flagged until the next try.
  await expect(page.getByText("Enter your password.")).toHaveCount(0);
});

test("e-mail codes turn on with the password, showing the recovery codes once, and off again", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e", { emailVerified: true });
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Turn on e-mail codes" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn on", exact: true }).click();

  const codes = section.getByRole("region", { name: "Your recovery codes" });
  await expect(codes.getByRole("heading")).toBeFocused();
  await expect(codes.getByRole("listitem")).toHaveText(MOCK_RECOVERY_CODES);
  await expect(codes.getByRole("link", { name: "Download" })).toHaveAttribute(
    "download",
    "vb2007.hu-recovery-codes.txt"
  );
  await expect(page.getByText("E-mail codes are on")).toBeVisible();
  await expect(section.getByText("On", { exact: true })).toBeVisible();

  await codes.getByRole("button", { name: "I've saved them" }).click();
  await expect(codes).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Turn off e-mail codes" })).toBeFocused();

  await section.getByRole("button", { name: "Turn off e-mail codes" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "E-mail codes are off" })).toBeFocused();
  await expect(section.getByText("Off", { exact: true })).toBeVisible();
});

/** Sends a recovery code from the step's open recovery form; `passes` says whether the API took it. */
async function sendRecoveryCode(page: Page, code: string, passes: boolean) {
  const main = page.getByRole("main");
  await main.getByLabel("Recovery code").fill(code);
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(
    passes
      ? main.getByText("Login successful!")
      : main.getByText("That code didn't work, or it was already used")
  ).toBeVisible();
}

test("a recovery code logs in once, in any case and with spaces", async ({
  page,
  api,
  isMobile
}) => {
  api.hasMfaEmail();
  await passPassword(page);
  await expect(page.getByText("Lost every way in?")).toContainText(
    "A password reset doesn't turn this step off"
  );
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(page.getByRole("heading", { name: "Recovery code" })).toBeVisible();

  await sendRecoveryCode(page, ` ${MOCK_RECOVERY_CODES[0].toUpperCase()} `, true);
  await page.goto("/account");
  await expect(page.getByText("9 of 10 left.")).toBeVisible();

  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await passPassword(page);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await sendRecoveryCode(page, MOCK_RECOVERY_CODES[0], false);
  await expect(page.getByLabel("Recovery code")).toBeFocused();
});

test("new recovery codes show once and replace the old ones", async ({ page, api, isMobile }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e", { emailVerified: true });
  api.hasMfaEmail();
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await expect(section.getByText("10 of 10 left.")).toBeVisible();

  await section.getByRole("button", { name: "Generate new codes" }).click();
  await expect(section.getByText("Your current codes stop working")).toBeVisible();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Generate", exact: true }).click();

  const codes = section.getByRole("region", { name: "Your recovery codes" });
  await expect(codes.getByRole("heading")).toBeFocused();
  await expect(codes.getByRole("listitem")).toHaveText(MOCK_NEW_RECOVERY_CODES);
  await expect(page.getByText("the earlier ones no longer work")).toBeVisible();
  await codes.getByRole("button", { name: "I've saved them" }).click();

  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "Log out" }).click();
  await passPassword(page);
  await page.getByRole("button", { name: "Use a recovery code" }).click();
  await sendRecoveryCode(page, MOCK_RECOVERY_CODES[1], false);
  await sendRecoveryCode(page, MOCK_NEW_RECOVERY_CODES[1], true);
});

test("a wrong password doesn't turn e-mail codes on", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e", { emailVerified: true });
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Turn on e-mail codes" }).click();
  await section.getByLabel("Password").fill("not-the-password");
  await section.getByRole("button", { name: "Turn on", exact: true }).click();

  await expect(section.getByRole("alert")).toHaveText("The provided password is incorrect.");
  await expect(section.getByLabel("Password")).toBeFocused();
  await expect(section.getByText("Off", { exact: true })).toBeVisible();
});

test("the admin's MFA reset turns the account's second step off, from one store", async ({
  page,
  api
}) => {
  const anna = api.hasUser("anna", {
    emailVerified: true,
    mfa: { email: true, recoveryCodesLeft: 10 }
  });
  const logInAsAnna = async () => {
    await page.goto("/login");
    await page.getByLabel("E-mail").fill("anna@example.com");
    await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
  };
  await logInAsAnna();
  await expect(page.getByRole("heading", { name: "E-mail code" })).toBeVisible();

  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  await page.goto(`/admin/users/${anna.id}`);
  const row = page.locator(".action").filter({ hasText: "Reset MFA" });
  await row.getByRole("button", { name: "Reset MFA" }).click();
  await page.getByRole("button", { name: "Reset anna's MFA" }).click();
  await expect(row.getByRole("status")).toBeVisible();
  api.loggedOut();

  await logInAsAnna();
  await expect(page.getByText("Login successful!")).toBeVisible();
});
