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
  await expect(main.getByText("The code is wrong, expired or already used")).toBeVisible();
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
  await expect(page.getByText("E-mail MFA turned on")).toBeVisible();
  await expect(section.getByText("On", { exact: true })).toBeVisible();

  await codes.getByRole("button", { name: "I've saved them" }).click();
  await expect(codes).toHaveCount(0);

  await section.getByRole("button", { name: "Turn off e-mail codes" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "E-mail MFA turned off." })
  ).toBeFocused();
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
      : main.getByText("The code is wrong, expired or already used")
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
