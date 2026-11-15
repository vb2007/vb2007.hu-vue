import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import {
  emailVerified,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  mfa,
  NO_MFA,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";
const SETUP = {
  secret: SECRET,
  otpauthUrl: `otpauth://totp/vb2007.hu:vb?secret=${SECRET}&issuer=vb2007.hu&algorithm=SHA1&digits=6&period=30`
};
const CODES = Array.from({ length: 10 }, (_, i) => `abcd${i}-efgh${i}`);
const ON = "TOTP MFA turned on: logins now also need a code from the authenticator app.";
const OFF = "TOTP MFA turned off.";
const WRONG = "The code is wrong, expired or already used: check it or request a new one.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

/** `GET /user` after the change, with TOTP as `totp`. */
const user = (totp: boolean, recoveryCodesLeft = 0) =>
  jsonResponse(200, {
    _id: "0123456789abcdef01234567",
    username: "vb",
    email: "vb@example.com",
    hasPassword: true,
    emailVerified: true,
    mfa: { ...NO_MFA, totp, recoveryCodesLeft }
  });

const mountPanel = async () => {
  ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
  return wrapper!;
};

/** The Authenticator app row, after the E-mail codes one. */
const row = (panel: VueWrapper) => panel.findAll('[aria-labelledby="mfa-title"] .login')[1];
const keyNamed = (where: VueWrapper | DOMWrapper<Element>, text: string) =>
  where.findAll("button").find((button) => button.text() === text)!;
const codeField = (panel: VueWrapper) => row(panel).find(".setup input");

/** Opens the setup with the password, answered with `SETUP`. */
const openSetup = async (panel: VueWrapper, key = "Set up authenticator app") => {
  await keyNamed(row(panel), key).trigger("click");
  fetchMock.mockResolvedValueOnce(jsonResponse(200, SETUP));
  await row(panel).find('input[type="password"]').setValue("hunter22");
  await row(panel).find("form").trigger("submit");
  await flushPromises();
};

/** Sends `code` to confirm the setup, answered with `response`. */
const confirmWith = async (panel: VueWrapper, code: string, response: Response) => {
  fetchMock.mockResolvedValueOnce(response);
  await codeField(panel).setValue(code);
  await row(panel).find(".setup form").trigger("submit");
  await flushPromises();
};

describe("AccountPanel's authenticator app", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => "blob:codes");
    URL.revokeObjectURL = vi.fn();
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    username.value = "vb";
    userEmail.value = "vb@example.com";
    hasPassword.value = true;
    emailVerified.value = true;
    mfa.value = { ...NO_MFA };
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows it as off, with a key to set it up", async () => {
    const panel = await mountPanel();

    expect(row(panel).find(".login__name").text()).toBe("Authenticator app");
    expect(row(panel).find(".badge").text()).toBe("Off");
    expect(row(panel).find(".login__note").text()).toBe(
      "Use a code from an app on your phone at each login, even offline."
    );
    expect(
      row(panel)
        .findAll("button")
        .map((key) => key.text())
    ).toEqual(["Set up authenticator app"]);
  });

  it("sets it up: the password, the QR code and key, then the first code with recovery codes", async () => {
    const panel = await mountPanel();
    await keyNamed(row(panel), "Set up authenticator app").trigger("click");
    expect(document.activeElement).toBe(row(panel).find('input[type="password"]').element);
    expect(row(panel).text()).toContain("Then you scan a QR code with your authenticator app.");

    fetchMock.mockResolvedValueOnce(jsonResponse(200, SETUP));
    await row(panel).find('input[type="password"]').setValue("hunter22");
    await row(panel).find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/mfa/totp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" }),
      credentials: "include"
    });
    const setup = row(panel).find(".setup");
    expect(document.activeElement).toBe(setup.find("h4").element);
    expect(setup.find("h4").text()).toBe("Scan the QR code");
    expect(setup.attributes("aria-labelledby")).toBe(setup.find("h4").attributes("id"));
    expect(setup.find("svg").attributes("aria-label")).toBe("QR code for your authenticator app");
    // 4 modules of quiet zone around it, and its finder pattern's corner right after.
    expect(setup.find("svg path").attributes("d")).toMatch(/^M4 4h7v1H4z/);
    expect(setup.find(".setup__secret").text()).toBe("JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP");
    expect(codeField(panel).attributes("autocomplete")).toBe("one-time-code");

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }))
      .mockResolvedValueOnce(user(true, 10));
    await codeField(panel).setValue("123 456");
    await row(panel).find(".setup form").trigger("submit");
    await flushPromises();

    expect(fetchMock.mock.calls[1]).toEqual([
      "https://api.test/user/mfa/totp/confirm",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "123456" }),
        credentials: "include"
      }
    ]);
  });

  it("turns on with the first code, refreshes the account and shows the recovery codes", async () => {
    const panel = await mountPanel();
    await openSetup(panel);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }))
      .mockResolvedValueOnce(user(true, 10));
    await codeField(panel).setValue("123456");
    await row(panel).find(".setup form").trigger("submit");
    await flushPromises();

    expect(mfa.value.totp).toBe(true);
    expect(row(panel).find(".badge").text()).toBe("On");
    expect(row(panel).find(".setup").exists()).toBe(false);
    expect(panel.text()).not.toContain("JBSW");
    expect(panel.find(".notice").text()).toBe(ON);
    expect(panel.findAll(".codes__code").map((code) => code.text())).toEqual(CODES);
    expect(document.activeElement).toBe(panel.find("#codes-title").element);
  });

  it("keeps an open setup when the account is looked up again meanwhile", async () => {
    const panel = await mountPanel();
    await openSetup(panel);
    await codeField(panel).setValue("12");

    mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 10 };
    await flushPromises();

    expect(row(panel).find(".setup__secret").text()).toBe(
      "JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP"
    );
    expect((codeField(panel).element as HTMLInputElement).value).toBe("12");
  });

  it("copies the key as the API sent it, or says to select it", async () => {
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const panel = await mountPanel();
    await openSetup(panel);

    await keyNamed(row(panel), "Copy key").trigger("click");
    await flushPromises();
    expect(writeText).toHaveBeenCalledWith(SECRET);
    expect(row(panel).find('.setup [role="status"]').text()).toBe("Key copied.");
    expect(keyNamed(row(panel), "Copied").exists()).toBe(true);

    await keyNamed(row(panel), "Copied").trigger("click");
    await flushPromises();
    expect(row(panel).find('.setup [role="status"]').text()).toBe(
      "Couldn't copy: select the key instead."
    );
  });

  it("checks the code before sending it", async () => {
    const panel = await mountPanel();
    await openSetup(panel);

    await codeField(panel).setValue("12a");
    expect(row(panel).find(".field__error").text()).toBe(
      "Enter the 6-digit code from your authenticator app."
    );
    await codeField(panel).setValue("123");
    expect(row(panel).find(".field__error").exists()).toBe(false);
    await codeField(panel).trigger("blur");
    expect(row(panel).find(".field__error").exists()).toBe(true);
    await row(panel).find(".setup form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("keeps the cursor in the field after a wrong code, and offers to start again", async () => {
    const panel = await mountPanel();
    await openSetup(panel);
    expect(keyNamed(row(panel), "Start again")).toBeUndefined();

    await confirmWith(panel, "000000", jsonResponse(400, { error: WRONG }));

    expect(row(panel).find(".field__error").text()).toBe(WRONG);
    expect(document.activeElement).toBe(codeField(panel).element);
    await codeField(panel).setValue("111111");
    expect(row(panel).find(".field__error").exists()).toBe(false);

    await keyNamed(row(panel), "Start again").trigger("click");
    await flushPromises();
    expect(row(panel).find(".setup").exists()).toBe(false);
    expect(document.activeElement).toBe(row(panel).find('input[type="password"]').element);
  });

  it("starts again once the setup's tries are used up, with the QR code gone", async () => {
    const panel = await mountPanel();
    await openSetup(panel);

    for (let tries = 0; tries < 5; tries++) {
      await confirmWith(panel, "000000", jsonResponse(400, { error: WRONG }));
    }

    const ranOut = row(panel).find(".setup__ran-out");
    expect(ranOut.text()).toBe(
      "This setup has run out: it works for 10 minutes, with 5 tries. Start again for a new QR code, and replace what your app added from this one."
    );
    expect(document.activeElement).toBe(ranOut.element);
    expect(row(panel).find("h4").text()).toBe("Setup ran out");
    expect(row(panel).find("svg[role=img]").exists()).toBe(false);

    await keyNamed(row(panel), "Start again").trigger("click");
    await openSetupAgain(panel);
    expect(row(panel).find(".setup__ran-out").exists()).toBe(false);
    expect(row(panel).find(".setup svg").exists()).toBe(true);
  });

  it("starts again once the setup's minutes are over", async () => {
    const panel = await mountPanel();
    const now = Date.now();
    await openSetup(panel);
    vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60_000 + 1000);

    await confirmWith(panel, "123456", jsonResponse(400, { error: WRONG }));

    expect(row(panel).find(".setup__ran-out").exists()).toBe(true);
    await keyNamed(row(panel), "Cancel").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(keyNamed(row(panel), "Set up authenticator app").element);
  });

  it("holds the key after the code checks' 429, and shows other failures", async () => {
    const panel = await mountPanel();
    await openSetup(panel);

    await confirmWith(
      panel,
      "123456",
      jsonResponse(429, { error: "Too many failed attempts: try again later.", retryAfter: 900 })
    );
    const submit = row(panel).find('.setup button[type="submit"]');
    expect(row(panel).find('.setup [role="alert"]').text()).toContain(
      "Too many failed attempts: try again later."
    );
    expect(submit.attributes("disabled")).toBeDefined();
    expect(submit.text()).toBe("Try again in 15 min");
    await row(panel).find(".setup form").trigger("submit");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    wrapper!.unmount();
    wrapper = undefined;
    const second = await mountPanel();
    await openSetup(second);
    await confirmWith(second, "123456", jsonResponse(500, {}));
    expect(row(second).find('.setup [role="alert"]').text()).toBe("Failed to check the code: 500");
    expect(row(second).find('.setup button[type="submit"]').attributes("disabled")).toBeUndefined();
  });

  it("sends one code at a time, and Escape waits for it", async () => {
    const panel = await mountPanel();
    await openSetup(panel);
    const answer = deferResponse(fetchMock);
    await codeField(panel).setValue("123456");
    await row(panel).find(".setup form").trigger("submit");
    await flushPromises();
    expect(row(panel).find('.setup button[type="submit"]').text()).toBe("Turning on");

    await row(panel).find(".setup form").trigger("submit");
    await row(panel).find(".setup").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(row(panel).find(".setup").exists()).toBe(true);

    answer.respond(jsonResponse(400, { error: WRONG }));
    await flushPromises();
    await row(panel).find(".setup").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(row(panel).find(".setup").exists()).toBe(false);
    expect(document.activeElement).toBe(keyNamed(row(panel), "Set up authenticator app").element);
  });

  it("moves to a new app while the old one keeps working", async () => {
    mfa.value = { ...NO_MFA, totp: true, recoveryCodesLeft: 10 };
    const panel = await mountPanel();
    expect(row(panel).find(".badge").text()).toBe("On");
    expect(row(panel).find(".login__note").text()).toBe(
      "Each login can take a code from your authenticator app."
    );
    await keyNamed(row(panel), "Move to a new app").trigger("click");
    expect(row(panel).text()).toContain(
      "Your current app keeps working until the new one is set up."
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, SETUP));
    await row(panel).find('input[type="password"]').setValue("hunter22");
    await row(panel).find("form").trigger("submit");
    await flushPromises();

    expect(row(panel).find("h4").text()).toBe("Scan with your new app");
    expect(row(panel).find(".setup__note").text()).toContain(
      "Your current app keeps working until then."
    );
    const submit = row(panel).find('.setup button[type="submit"]');
    expect(submit.text()).toBe("Move to this app");

    const answer = deferResponse(fetchMock);
    await codeField(panel).setValue("123456");
    await row(panel).find(".setup form").trigger("submit");
    await flushPromises();
    expect(submit.text()).toBe("Moving");
    fetchMock.mockResolvedValueOnce(user(true, 10));
    answer.respond(jsonResponse(200, { message: ON }));
    await flushPromises();

    expect(panel.find(".codes").exists()).toBe(false);
    expect(document.activeElement).toBe(panel.find(".notice").element);
  });

  it("turns it off with the password, or cancels back on its key", async () => {
    mfa.value = { ...NO_MFA, totp: true, recoveryCodesLeft: 10 };
    const panel = await mountPanel();
    await keyNamed(row(panel), "Turn off authenticator app").trigger("click");
    await keyNamed(row(panel), "Cancel").trigger("click");
    await flushPromises();
    expect(document.activeElement).toBe(keyNamed(row(panel), "Turn off authenticator app").element);

    await keyNamed(row(panel), "Turn off authenticator app").trigger("click");
    expect(row(panel).text()).toContain("Without another second step, your recovery codes go too.");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: OFF }))
      .mockResolvedValueOnce(user(false));
    await row(panel).find('input[type="password"]').setValue("hunter22");
    await row(panel).find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/user/mfa/totp");
    expect(fetchMock.mock.calls[0][1]!.method).toBe("DELETE");
    expect(row(panel).find(".badge").text()).toBe("Off");
    expect(panel.find(".notice").text()).toBe(OFF);
    expect(document.activeElement).toBe(panel.find(".notice").element);
  });
});

/** The password again, after Start again, answered with the same `SETUP`. */
async function openSetupAgain(panel: VueWrapper) {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, SETUP));
  await row(panel).find('input[type="password"]').setValue("hunter22");
  await row(panel).find("form").trigger("submit");
  await flushPromises();
}
