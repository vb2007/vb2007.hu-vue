import type { Locator, Page } from "@playwright/test";
import {
  expect,
  MFA_EXPIRED_ERROR,
  MOCK_EMAIL,
  MOCK_MFA_CODE,
  MOCK_MFA_LINK_TOKEN,
  MOCK_PASSWORD,
  MOCK_RECOVERY_CODES,
  MOCK_TOTP_CODE,
  MOCK_TOTP_SECRET,
  test
} from "./fixtures";

/** Logs in with the password of `MOCK_EMAIL`, whose account has MFA on, until `method`'s step shows. */
async function passPassword(page: Page, method = "E-mail code") {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("heading", { name: method })).toBeVisible();
}

/** The E-mail codes row of the account's Two-step login section, with its own On/Off badge. */
const emailRow = (section: Locator) =>
  section.locator(".login").filter({ hasText: "E-mail codes" });

/** Opens the authenticator app's setup on the account page, past the password. */
async function startTotpSetup(page: Page) {
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Set up authenticator app" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Continue" }).click();
  return section;
}

test("an authenticator app's code logs in, before any mail", async ({ page, api }) => {
  api.hasMfaEmail();
  api.hasMfaTotp();
  await passPassword(page, "Authenticator app");
  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Use an e-mail code" })).toBeVisible();
  const code = main.getByLabel("Code from your authenticator app");

  await code.fill("000000");
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(main.getByText("The code is wrong, expired or already used")).toBeVisible();
  await expect(code).toBeFocused();

  await code.fill(MOCK_TOTP_CODE);
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(main.getByText("Login successful!")).toBeVisible();
});

test("an authenticator app is set up with its QR code and first code, showing the recovery codes once", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const section = await startTotpSetup(page);

  const setup = section.getByRole("group", { name: "Scan the QR code" });
  await expect(setup.getByRole("heading")).toBeFocused();
  await expect(
    setup.getByRole("img", { name: "QR code for your authenticator app" })
  ).toBeVisible();
  await expect(setup.getByText(MOCK_TOTP_SECRET.match(/.{4}/g)!.join(" "))).toBeVisible();

  const code = setup.getByLabel("Code from your app");
  await code.fill("000000");
  await setup.getByRole("button", { name: "Turn on", exact: true }).click();
  await expect(setup.getByText("The code is wrong, expired or already used")).toBeVisible();
  await expect(code).toBeFocused();

  await code.fill(MOCK_TOTP_CODE);
  await setup.getByRole("button", { name: "Turn on", exact: true }).click();
  const codes = section.getByRole("region", { name: "Your recovery codes" });
  await expect(codes.getByRole("heading")).toBeFocused();
  await expect(codes.getByRole("listitem")).toHaveText(MOCK_RECOVERY_CODES);
  await expect(page.getByText("TOTP MFA turned on")).toBeVisible();
  await expect(setup).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Move to a new app" })).toBeVisible();
});

test("a setup whose tries ran out offers to start again", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const section = await startTotpSetup(page);
  const code = section.getByLabel("Code from your app");
  for (let tries = 0; tries < 5; tries++) {
    await code.fill(`00000${tries}`);
    await section.getByRole("button", { name: "Turn on", exact: true }).click();
    if (tries < 4) await expect(code).toBeFocused();
  }

  await expect(
    section.getByRole("status").filter({ hasText: "This setup has run out" })
  ).toBeFocused();
  await expect(section.getByRole("img")).toHaveCount(0);
  await section.getByRole("button", { name: "Start again" }).click();
  await expect(section.getByLabel("Password")).toBeFocused();
});

test("an authenticator app turns off with the password", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasMfaTotp();
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Turn off authenticator app" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();

  await expect(page.getByRole("status").filter({ hasText: "TOTP MFA turned off." })).toBeFocused();
  await expect(section.getByRole("button", { name: "Set up authenticator app" })).toBeVisible();
});

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
  await expect(emailRow(section).getByText("On", { exact: true })).toBeVisible();

  await codes.getByRole("button", { name: "I've saved them" }).click();
  await expect(codes).toHaveCount(0);

  await section.getByRole("button", { name: "Turn off e-mail codes" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "E-mail MFA turned off." })
  ).toBeFocused();
  await expect(emailRow(section).getByText("Off", { exact: true })).toBeVisible();
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
  await expect(emailRow(section).getByText("Off", { exact: true })).toBeVisible();
});
