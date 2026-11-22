import type { Locator, Page } from "@playwright/test";
import {
  expect,
  MOCK_EMAIL,
  MOCK_MFA_CODE,
  MOCK_MFA_LINK_TOKEN,
  MOCK_NEW_RECOVERY_CODES,
  MOCK_PASSWORD,
  MOCK_RECOVERY_CODES,
  MOCK_TOTP_CODE,
  MOCK_TOTP_SECRET,
  test
} from "./fixtures";

/** The second step's end, in the site's words for the API's 403 `reason`s. */
const NO_CHALLENGE =
  "This browser has no login waiting for its second step: log in again. A mailed login link only works in the browser you logged in from.";
const STEP_EXPIRED = "This login timed out: its second step works for 10 minutes. Log in again.";
const TRIES_USED_UP = "Too many wrong answers: this login used up its 5 tries. Log in again.";

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
  // The field's error, in the site's words, which the step also reads out.
  await expect(code).toHaveAccessibleDescription(
    /That code didn't work: check it, or wait for the next one\./
  );
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
  await expect(
    setup.getByText("That code didn't work: check it, or wait for the next one.")
  ).toBeVisible();
  await expect(code).toBeFocused();

  await code.fill(MOCK_TOTP_CODE);
  await setup.getByRole("button", { name: "Turn on", exact: true }).click();
  const codes = section.getByRole("region", { name: "Your recovery codes" });
  await expect(codes.getByRole("heading")).toBeFocused();
  await expect(codes.getByRole("listitem")).toHaveText(MOCK_RECOVERY_CODES);
  await expect(
    page.getByText("Authenticator app is on: each login can now take a code from it.")
  ).toBeVisible();
  await expect(setup).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Move to a new app" })).toBeVisible();
});

test("a setup counts its tries down, and offers to start again once they're used up", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const section = await startTotpSetup(page);
  const code = section.getByLabel("Code from your app");
  for (const left of [
    /4 tries left\./,
    /3 tries left\./,
    /2 tries left\./,
    /This is your last try/
  ]) {
    await code.fill("000000");
    await section.getByRole("button", { name: "Turn on", exact: true }).click();
    await expect(code).toBeFocused();
    await expect(code).toHaveAccessibleDescription(left);
  }
  // The last try stays in the hint while the next code is typed.
  await code.fill("00000");
  await expect(code).toHaveAccessibleDescription(
    /This is your last try: a wrong code ends this setup\./
  );
  await code.fill("000000");
  await section.getByRole("button", { name: "Turn on", exact: true }).click();

  await expect(
    section.getByRole("status").filter({ hasText: "This setup's 5 tries are used up." })
  ).toBeFocused();
  await expect(section.getByRole("heading", { name: "Setup ended" })).toBeVisible();
  await expect(section.getByRole("img")).toHaveCount(0);
  await section.getByRole("button", { name: "Start again" }).click();
  await expect(section.getByLabel("Password")).toBeFocused();
});

test("a setup that's gone says why", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const section = await startTotpSetup(page);
  const code = section.getByLabel("Code from your app");
  const turnOn = section.getByRole("button", { name: "Turn on", exact: true });
  await expect(code).toBeVisible();
  api.endsTotpSetup("expired");
  await code.fill(MOCK_TOTP_CODE);
  await turnOn.click();
  await expect(
    section.getByRole("status").filter({ hasText: "This setup ran out of time" })
  ).toBeFocused();

  await section.getByRole("button", { name: "Start again" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(code).toBeVisible();
  api.endsTotpSetup("replaced");
  await code.fill(MOCK_TOTP_CODE);
  await turnOn.click();
  await expect(
    section.getByRole("status").filter({ hasText: "a newer setup replaced it" })
  ).toBeFocused();
  await expect(section.getByRole("heading", { name: "Setup ended" })).toBeVisible();
});

test("a setup another tab confirmed closes with TOTP on", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  const section = await startTotpSetup(page);
  await expect(section.getByLabel("Code from your app")).toBeVisible();
  api.endsTotpSetup("confirmed");
  await section.getByLabel("Code from your app").fill(MOCK_TOTP_CODE);
  await section.getByRole("button", { name: "Turn on", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "this page missed the answer that turned it on" })
  ).toBeFocused();
  await expect(section.getByRole("group", { name: "Scan the QR code" })).toHaveCount(0);
  await expect(section.getByRole("region", { name: "Your recovery codes" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Move to a new app" })).toBeVisible();
});

test("a move whose setup is gone can't tell whether it went through", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasMfaTotp();
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Move to a new app" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(section.getByLabel("Code from your app")).toBeVisible();
  api.endsTotpSetup("confirmed");
  await section.getByLabel("Code from your app").fill(MOCK_TOTP_CODE);
  await section.getByRole("button", { name: "Move to this app" }).click();

  await expect(
    section.getByRole("status").filter({ hasText: "can't tell whether the move went through" })
  ).toBeFocused();
  await expect(section.getByRole("button", { name: "Start again" })).toBeVisible();
});

test("an authenticator app turns off with the password", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasMfaTotp();
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Two-step login" });
  await section.getByRole("button", { name: "Turn off authenticator app" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();

  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Authenticator app is off: logins no longer take its codes." })
  ).toBeFocused();
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

  // Opened again from the mail (a page load of its own, not a fragment change on this page), the
  // used-up link finds this browser logged in and sends nothing.
  await page.goto("/");
  await page.goto(`/login/mfa#token=${MOCK_MFA_LINK_TOKEN}`);
  await expect(
    page.getByRole("status").filter({ hasText: "You're already logged in." })
  ).toBeFocused();
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

test("a wrong link that used the last try in another tab ends the step's tab once it's back", async ({
  page,
  api
}) => {
  api.hasMfaEmail();
  await passPassword(page);
  await page.getByRole("button", { name: "E-mail me a code" }).click();
  for (const code of ["000000", "000001", "000002", "000003"]) {
    await page.getByLabel("Code from the e-mail").fill(code);
    await page.getByRole("button", { name: "Log in", exact: true }).click();
  }
  await expect(page.locator(".mfa__tries")).toContainText("1 try left.");

  const appOrigin = new URL(page.url()).origin;
  const mailTab = await page.context().newPage();
  await mailTab.route(
    (url) => url.origin !== appOrigin,
    (route) => api.handle(route, appOrigin)
  );
  await mailTab.goto("/login/mfa#token=not-the-token");
  await expect(mailTab.getByRole("alert")).toHaveText(TRIES_USED_UP);

  await page.bringToFront();
  await page.evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  await expect(page.getByRole("alert")).toHaveText(TRIES_USED_UP);
  await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
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

test("back from GitHub after the step expired, its message takes the focus", async ({
  page,
  api
}) => {
  api.hasMfaEmail();
  api.waitsForGithubMfa();
  api.expiresMfaChallenge();

  await page.goto("/login?mfa=required");

  const message = page.getByRole("alert");
  await expect(message).toHaveText(STEP_EXPIRED);
  await expect(message).toBeFocused();
});

test("back from GitHub with no step in this browser, it says so", async ({ page }) => {
  await page.goto("/login?mfa=required");

  await expect(page.getByRole("alert")).toHaveText(NO_CHALLENGE);
});

test("a refused link says so with the tries left, and the way back to Log in", async ({
  page,
  api
}) => {
  api.hasMfaEmail();
  await passPassword(page);

  await page.goto("/login/mfa#token=not-the-token");

  await expect(page.getByRole("alert")).toContainText("The login link is wrong");
  await expect(page.getByRole("alert")).toContainText("4 tries left.");
  await page.getByRole("link", { name: "Log in again" }).click();
  await expect(page.getByLabel("E-mail")).toBeVisible();
});

test("a link opened in another browser points to the one that logged in", async ({ page }) => {
  await page.goto(`/login/mfa#token=${MOCK_MFA_LINK_TOKEN}`);

  await expect(page.getByRole("alert")).toHaveText(NO_CHALLENGE);
  await expect(page.getByRole("alert")).toBeFocused();
});

test("an expired step goes back to the password with its message", async ({ page, api }) => {
  api.hasMfaEmail();
  await passPassword(page);
  api.expiresMfaChallenge();

  await page.getByRole("button", { name: "E-mail me a code" }).click();

  await expect(page.getByRole("alert")).toHaveText(STEP_EXPIRED);
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  await expect(page.getByLabel("E-mail")).toHaveValue(MOCK_EMAIL);
});

for (const [reason, text] of [
  ["triesUsedUp", TRIES_USED_UP],
  ["ended", "This login ended: a newer login replaced it, or it already finished. Log in again."]
] as const) {
  test(`a step that ${reason === "ended" ? "ended" : "used up its tries"} elsewhere says so on the password form`, async ({
    page,
    api
  }) => {
    api.hasMfaTotp();
    await passPassword(page, "Authenticator app");
    api.expiresMfaChallenge(reason);

    await page.getByLabel("Code from your authenticator app").fill(MOCK_TOTP_CODE);
    await page.getByRole("button", { name: "Log in", exact: true }).click();

    await expect(page.getByRole("alert")).toHaveText(text);
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
  });
}

test("wrong answers count the step's tries down, across methods, and the last one ends it", async ({
  page,
  api
}) => {
  api.hasMfaTotp();
  await passPassword(page, "Authenticator app");
  const main = page.getByRole("main");
  const tries = main.locator(".mfa__tries");
  const sendCode = async (label: string, code: string) => {
    await main.getByLabel(label).fill(code);
    await main.getByRole("button", { name: "Log in", exact: true }).click();
  };

  await sendCode("Code from your authenticator app", "000000");
  await expect(tries).toHaveText("4 tries left.");
  await sendCode("Code from your authenticator app", "000001");
  await expect(tries).toHaveText("3 tries left.");

  // The tries are the step's: a recovery code uses them too.
  await main.getByRole("button", { name: "Use a recovery code" }).click();
  await expect(tries).toHaveText("3 tries left.");
  await sendCode("Recovery code", "wrong-code");
  await expect(tries).toHaveText("2 tries left.");
  await sendCode("Recovery code", "wrong-code2");
  await expect(tries).toHaveText("1 try left. Another wrong answer ends this login.");

  await sendCode("Recovery code", "wrong-code3");
  await expect(page.getByRole("alert")).toHaveText(TRIES_USED_UP);
  await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
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
  await expect(emailRow(section).getByText("On", { exact: true })).toBeVisible();

  await codes.getByRole("button", { name: "I've saved them" }).click();
  await expect(codes).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Turn off e-mail codes" })).toBeFocused();

  await section.getByRole("button", { name: "Turn off e-mail codes" }).click();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Turn off", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "E-mail codes are off" })).toBeFocused();
  await expect(emailRow(section).getByText("Off", { exact: true })).toBeVisible();
});

/** Sends a recovery code from the step's open recovery form; `passes` says whether the API took it. */
async function sendRecoveryCode(page: Page, code: string, passes: boolean) {
  const main = page.getByRole("main");
  await main.getByLabel("Recovery code").fill(code);
  await main.getByRole("button", { name: "Log in", exact: true }).click();
  if (passes) await expect(main.getByText("Login successful!")).toBeVisible();
  else
    await expect(main.getByLabel("Recovery code")).toHaveAccessibleDescription(
      /That code didn't work, or it was already used/
    );
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
  await expect(emailRow(section).getByText("Off", { exact: true })).toBeVisible();
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
