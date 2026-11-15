import type { Page } from "@playwright/test";
import {
  expect,
  MOCK_EMAIL,
  MOCK_PASSWORD,
  MOCK_USER_ID,
  PASSKEY_INVALID_ERROR,
  test
} from "./fixtures";

/**
 * A platform authenticator with user verification (Chromium's virtual one, over CDP), which answers every
 * prompt at once, as if the user touched it.
 */
async function addAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true
    }
  });
}

/** Makes a passkey for `MOCK_EMAIL`'s account in the authenticator, outside the site; returns its id. */
async function makePasskey(page: Page): Promise<string> {
  const options = {
    challenge: "ZTJlLXRlc3Q",
    rp: { id: "localhost", name: "localhost" },
    user: {
      id: Buffer.from(MOCK_USER_ID, "hex").toString("base64url"),
      name: "e2e",
      displayName: "e2e"
    },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }],
    authenticatorSelection: { residentKey: "required", userVerification: "required" }
  };
  // A string, as the e2e project has no DOM types.
  return page.evaluate(
    `navigator.credentials.create({ publicKey: PublicKeyCredential.parseCreationOptionsFromJSON(${JSON.stringify(options)}) }).then((credential) => credential.id)`
  );
}

test("a passkey is added on the account page, renamed, and logs in", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  await page.goto("/account");
  await addAuthenticator(page);
  const section = page.getByRole("region", { name: "Passkeys" });
  await expect(section).toContainText("They don't turn on two-step login by themselves");

  await section.getByRole("button", { name: "Add a passkey" }).click();
  await expect(section.getByLabel("Name", { exact: true })).toBeFocused();
  await section.getByLabel("Name", { exact: true }).fill("Laptop");
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(section.getByLabel("Password")).toBeFocused();
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Add passkey" }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Passkey added successfully." })
  ).toBeFocused();
  const passkeys = section.getByRole("list", { name: "Your passkeys" });
  await expect(passkeys.getByRole("heading", { name: "Laptop" })).toBeVisible();
  await expect(passkeys).toContainText("Never used");

  await passkeys.getByRole("button", { name: "Rename Laptop" }).click();
  await expect(passkeys.getByLabel("New name")).toBeFocused();
  await passkeys.getByLabel("New name").fill("Work laptop");
  await passkeys.getByRole("button", { name: "Save name" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Passkey renamed successfully." })
  ).toBeFocused();
  await expect(passkeys.getByRole("heading", { name: "Work laptop" })).toBeVisible();

  // Logged out on the API; the next page load finds out.
  api.loggedOut();
  await page.goto("/login");
  await page.getByRole("button", { name: "Log in with a passkey" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();
  await page.goto("/account");
  await expect(section.getByRole("list", { name: "Your passkeys" })).toContainText("Last used");
});

test("a passkey this site doesn't know is refused on the login form", async ({ page }) => {
  await page.goto("/login");
  await addAuthenticator(page);
  await makePasskey(page);
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);

  await page.getByRole("button", { name: "Log in with a passkey" }).click();

  await expect(page.getByRole("alert")).toHaveText(PASSKEY_INVALID_ERROR);
  await expect(page.getByRole("button", { name: "Log in with a passkey" })).toBeFocused();
});

test("a passkey answers the second step, offered before the e-mail code", async ({ page, api }) => {
  api.hasMfaEmail();
  await page.goto("/login");
  await addAuthenticator(page);
  api.hasPasskey("Phone", { id: await makePasskey(page) });
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Passkey" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Use an e-mail code" })).toBeVisible();
  await page.getByRole("button", { name: "Use a passkey" }).click();

  await expect(page.getByText("Login successful!")).toBeVisible();
});

test("a passkey is deleted with the password", async ({ page, api }) => {
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasPasskey("Old phone");
  api.hasPasskey("Laptop");
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Passkeys" });

  await section.getByRole("button", { name: "Delete Old phone" }).click();
  await expect(section).toContainText("your browser or password manager keeps its copy");
  await section.getByLabel("Password").fill(MOCK_PASSWORD);
  await section.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(
    page.getByRole("status").filter({ hasText: "Passkey deleted successfully." })
  ).toBeFocused();
  await expect(section.getByRole("heading", { name: "Old phone" })).toHaveCount(0);
  await expect(section.getByRole("heading", { name: "Laptop" })).toBeVisible();
});

test("a browser without WebAuthn's JSON methods gets no passkey keys", async ({ page, api }) => {
  await page.addInitScript(() => {
    // @ts-expect-error: removed to stand in for an older browser.
    delete PublicKeyCredential.parseCreationOptionsFromJSON;
  });
  api.loggedInAs(MOCK_EMAIL, "e2e");
  api.hasPasskey("Laptop");
  await page.goto("/account");
  const section = page.getByRole("region", { name: "Passkeys" });

  await expect(section).toContainText("This browser can't use passkeys.");
  await expect(section.getByRole("button", { name: "Add a passkey" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "Rename Laptop" })).toBeVisible();
});
