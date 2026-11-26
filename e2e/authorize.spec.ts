import type { Page } from "@playwright/test";
import {
  expect,
  INVALID_AUTHORIZE_REQUEST,
  MOCK_EMAIL,
  MOCK_OAUTH_CLIENT,
  MOCK_OAUTH_CODE,
  MOCK_PASSWORD,
  MOCK_TOTP_CODE,
  test
} from "./fixtures";

/** What the API's `GET /oauth/authorize` hands the page for a valid request. */
const PARAMS = {
  response_type: "code",
  client_id: MOCK_OAUTH_CLIENT.id,
  redirect_uri: MOCK_OAUTH_CLIENT.redirectUri,
  state: "af0ifjsldkj",
  code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
  code_challenge_method: "S256",
  nonce: "n-0S6_WzA2Mj"
};

const authorizePath = (overrides: Record<string, string> = {}) =>
  `/authorize?${new URLSearchParams({ ...PARAMS, ...overrides })}`;

const callback = (answer: Record<string, string>) =>
  `${MOCK_OAUTH_CLIENT.redirectUri}?${new URLSearchParams(answer)}`;

const INVALID_CLIENT =
  "This sign-in link is for an app vb2007.hu doesn't know, so it stops here. Go back to the app and try again.";
const INVALID_REQUEST =
  "This sign-in link isn't valid, so nothing was sent to the app. Go back to the app and sign in again.";

/** The app's own callback page, which isn't the API's: answered here so the browser can land on it. */
async function servesApp(page: Page) {
  await page.route(`${new URL(MOCK_OAUTH_CLIENT.redirectUri).origin}/**`, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "<h1>spotdl-web</h1>" })
  );
}

async function logIn(page: Page, email = MOCK_EMAIL) {
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}

test("logged out, the login runs on the page, then Continue goes back to the app with a code", async ({
  page,
  api
}) => {
  await servesApp(page);
  await page.goto(authorizePath());
  await expect(page).toHaveTitle("Sign in · vb2007.hu");
  await expect(page.locator('head meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.getByText("Log in to continue to spotdl-web.")).toBeVisible();

  await logIn(page);
  const lead = page.getByText("wants you to sign in with your vb2007.hu account");
  await expect(lead).toBeFocused();
  await expect(lead).toContainText("spotdl-web");
  await expect(page.getByText("Signing in as")).toBeVisible();
  await expect(page.getByRole("main").getByText(MOCK_EMAIL)).toBeVisible();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(callback({ code: MOCK_OAUTH_CODE, state: PARAMS.state }));
  expect(api.authorizations).toEqual([{ ...PARAMS, approve: true }]);
});

test("a login with a second step comes back to the question too", async ({ page, api }) => {
  api.hasMfaTotp();
  await page.goto(authorizePath());
  await logIn(page);
  await page.getByLabel("Code from your authenticator app").fill(MOCK_TOTP_CODE);
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page).toHaveURL(authorizePath());
});

test("back from a GitHub login, the page asks again", async ({ page, api, baseURL }) => {
  // The double has no GitHub: its login logs in and lands on home, like the API's callback.
  await page.route("**/auth/github", (route) => {
    api.loggedInAs(MOCK_EMAIL, "e2e");
    return route.fulfill({ status: 302, headers: { location: `${baseURL}/` } });
  });
  await page.goto(authorizePath());
  await page.getByRole("link", { name: "Log in with GitHub" }).click();

  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/authorize");
  expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual(PARAMS);

  // The return was taken: home stays home.
  await page.goto("/");
  await expect(page).toHaveURL("/");
});

test("logged in, Cancel goes back to the app with access_denied", async ({ page, api }) => {
  await servesApp(page);
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto(authorizePath());
  await expect(page.getByRole("main").getByText("e2e", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(callback({ error: "access_denied", state: PARAMS.state }));
  expect(api.authorizations).toEqual([{ ...PARAMS, approve: false }]);
});

test("Use another account logs out, then signs in as the account logged in", async ({
  page,
  api
}) => {
  await servesApp(page);
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasUser("anna");
  await page.goto(authorizePath());

  await page.getByRole("button", { name: "Use another account" }).click();
  await expect(page.getByLabel("E-mail")).toBeFocused();
  await expect(page.getByText("Log in to continue to spotdl-web.")).toBeVisible();

  await logIn(page, "anna@example.com");
  await expect(page.getByRole("main").getByText("anna", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(callback({ code: MOCK_OAUTH_CODE, state: PARAMS.state }));
});

test.describe("a request that can't go on says why and goes nowhere", () => {
  for (const [what, path, message] of [
    ["?error=invalid_client", "/authorize?error=invalid_client", INVALID_CLIENT],
    [
      "?error=invalid_redirect_uri",
      "/authorize?error=invalid_redirect_uri",
      "This sign-in link would send you somewhere the app didn't register, so it stops here. Go back to the app and try again."
    ],
    ["an unknown client", authorizePath({ client_id: "nope" }), INVALID_CLIENT],
    ["a server-to-server client", authorizePath({ client_id: "status-bot" }), INVALID_CLIENT],
    ["a missing parameter", authorizePath().replace(/&nonce=[^&]*/, ""), INVALID_REQUEST]
  ]) {
    test(what, async ({ page, api }) => {
      api.loggedInAs(MOCK_EMAIL, "e2e");
      await page.goto(path);

      await expect(page.getByRole("alert").filter({ hasText: message })).toBeFocused();
      await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
      await page.getByRole("link", { name: "Back to home" }).click();
      await expect(page).toHaveURL("/");
      expect(api.authorizations).toEqual([]);
    });
  }
});

test("the API's 400 ends the request on the page", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto(authorizePath({ code_challenge: "too-short" }));
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByRole("alert").filter({ hasText: INVALID_REQUEST })).toBeFocused();
  await expect(page.getByText(INVALID_AUTHORIZE_REQUEST)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toHaveCount(0);
  expect(new URL(page.url()).pathname).toBe("/authorize");
});

test("the API's 429 holds both keys for its wait", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.limitsAuthorizations();
  await page.goto(authorizePath());
  await page.getByRole("button", { name: "Continue" }).click();

  const message = page.getByText(
    "Too many authorization requests from this account: try again later."
  );
  await expect(message).toBeVisible();
  await expect(page.getByRole("button", { name: /^Try again in 4\d seconds$/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeDisabled();
});

test("a session that ended meanwhile brings back the login, and nothing goes to the app", async ({
  page,
  api
}) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto(authorizePath());
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  api.loggedOut();

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByText(
      "Your session ended, so nothing was sent to spotdl-web. Log in again to continue."
    )
  ).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/authorize");
});
