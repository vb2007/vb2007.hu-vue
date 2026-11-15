import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
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
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const CODES = Array.from({ length: 10 }, (_, i) => `abcd${i}-efgh${i}`);
const ON =
  "E-mail MFA turned on: logins now also need a code or link mailed to the account's address.";
const OFF = "E-mail MFA turned off.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

/** `GET /user` after the change, with e-mail MFA as `email`. */
const user = (email: boolean, recoveryCodesLeft = 0) =>
  jsonResponse(200, {
    _id: "0123456789abcdef01234567",
    username: "vb",
    email: "vb@example.com",
    hasPassword: true,
    emailVerified: true,
    mfa: { ...NO_MFA, email, recoveryCodesLeft }
  });

const mountPanel = async () => {
  ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
  return wrapper!;
};

const mfaRow = (panel: VueWrapper) => panel.find('[aria-labelledby="mfa-title"] .login');
const keyNamed = (panel: VueWrapper, text: string) =>
  panel.findAll("button").find((button) => button.text() === text)!;

describe("AccountPanel's two-step login", () => {
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
  });

  it("shows e-mail codes as off, with a key to turn them on", async () => {
    const panel = await mountPanel();

    expect(panel.find("#mfa-title").text()).toBe("Two-step login");
    expect(mfaRow(panel).find(".badge").text()).toBe("Off");
    expect(mfaRow(panel).find(".login__note").text()).toBe(
      "Get a code or link by e-mail at each login."
    );
    expect(mfaRow(panel).find("button").text()).toBe("Turn on e-mail codes");
  });

  it("asks to confirm the address first, without a key, while it isn't confirmed", async () => {
    emailVerified.value = false;
    const panel = await mountPanel();

    expect(mfaRow(panel).find(".login__note").text()).toMatch(/^Confirm your e-mail address first/);
    expect(mfaRow(panel).find("button").exists()).toBe(false);
  });

  it("turns e-mail codes on with the password and shows the new recovery codes once", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");
    expect(document.activeElement).toBe(mfaRow(panel).find('input[type="password"]').element);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }))
      .mockResolvedValueOnce(user(true, 10));
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/mfa/email", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "hunter22" }),
      credentials: "include"
    });
    expect(mfa.value.email).toBe(true);
    expect(mfaRow(panel).find(".badge").text()).toBe("On");
    expect(panel.find(".notice").text()).toBe(ON);
    expect(panel.findAll(".codes__code").map((code) => code.text())).toEqual(CODES);
    expect(document.activeElement).toBe(panel.find("#codes-title").element);

    await keyNamed(panel, "I've saved them").trigger("click");
    await flushPromises();

    expect(panel.find(".codes").exists()).toBe(false);
    expect(document.activeElement).toBe(panel.find(".notice").element);
  });

  it("turns e-mail codes off and moves the focus to the message", async () => {
    mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 10 };
    const panel = await mountPanel();
    expect(mfaRow(panel).find(".login__note").text()).toBe(
      "Each login also takes a code or link mailed to your address."
    );
    await mfaRow(panel).find("button").trigger("click");

    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: OFF }))
      .mockResolvedValueOnce(user(false));
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock.mock.calls[0][1]!.method).toBe("DELETE");
    expect(mfaRow(panel).find(".badge").text()).toBe("Off");
    expect(panel.find(".codes").exists()).toBe(false);
    expect(document.activeElement).toBe(panel.find(".notice").element);
  });

  it("closes the form with Cancel, back on its key", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");

    await keyNamed(panel, "Cancel").trigger("click");
    await flushPromises();

    expect(mfaRow(panel).find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(mfaRow(panel).find("button").element);
  });

  describe("recovery codes", () => {
    const REPLACED =
      "New recovery codes made, and the earlier ones no longer work: store these somewhere safe, they aren't shown again.";
    const NEW_CODES = CODES.map((code) => code.toUpperCase());
    const codesRow = (panel: VueWrapper) =>
      panel.findAll('[aria-labelledby="mfa-title"] .login')[1];

    it("has no row without a method on", async () => {
      const panel = await mountPanel();

      expect(panel.text()).not.toContain("Recovery codes");
    });

    it("counts the codes left, warning when few or none are", async () => {
      mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 10 };
      const panel = await mountPanel();
      expect(codesRow(panel).find(".login__name").text()).toBe("Recovery codes");
      expect(codesRow(panel).find(".login__note").text()).toBe(
        "10 of 10 left. Each logs in once if you can't do your second step."
      );
      expect(codesRow(panel).find(".pill").exists()).toBe(false);

      mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 3 };
      await flushPromises();
      expect(codesRow(panel).find(".pill").text()).toBe("Few left");

      mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 0 };
      await flushPromises();
      expect(codesRow(panel).find(".pill").text()).toBe("None left");
      expect(codesRow(panel).find(".login__note").text()).toMatch(/^All used\. Generate new ones/);
    });

    it("generates new codes with the password, saying the old ones stop working, and shows them once", async () => {
      mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 2 };
      const panel = await mountPanel();
      await keyNamed(panel, "Generate new codes").trigger("click");
      expect(codesRow(panel).find(".field__hint").text()).toBe(
        "Confirms it's you. Your current codes stop working, and the new ones show only once."
      );

      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: REPLACED, recoveryCodes: NEW_CODES }))
        .mockResolvedValueOnce(user(true, 10));
      await codesRow(panel).find('input[type="password"]').setValue("hunter22");
      await codesRow(panel).find("form").trigger("submit");
      await flushPromises();

      expect(fetchMock).toHaveBeenNthCalledWith(1, "https://api.test/user/mfa/recovery-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "hunter22" }),
        credentials: "include"
      });
      expect(panel.find(".notice").text()).toBe(REPLACED);
      expect(panel.findAll(".codes__code").map((code) => code.text())).toEqual(NEW_CODES);
      expect(document.activeElement).toBe(panel.find("#codes-title").element);
      expect(codesRow(panel).find(".login__note").text()).toMatch(/^10 of 10 left/);
    });

    it("closes the form with Cancel, back on its key", async () => {
      mfa.value = { ...NO_MFA, email: true, recoveryCodesLeft: 10 };
      const panel = await mountPanel();
      await keyNamed(panel, "Generate new codes").trigger("click");

      await keyNamed(panel, "Cancel").trigger("click");
      await flushPromises();

      expect(codesRow(panel).find("form").exists()).toBe(false);
      expect(document.activeElement).toBe(keyNamed(panel, "Generate new codes").element);
    });
  });
});
