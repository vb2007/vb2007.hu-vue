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
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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
    // The section's own words, not the API's.
    expect(panel.find(".notice").text()).toBe(
      "E-mail codes are on: each login now also takes a code or link from your inbox."
    );
    expect(panel.findAll(".codes__code").map((code) => code.text())).toEqual(CODES);
    expect(document.activeElement).toBe(panel.find("#codes-title").element);

    await keyNamed(panel, "I've saved them").trigger("click");
    await flushPromises();

    expect(panel.find(".codes").exists()).toBe(false);
    // The focus stays in the section, on the row's key.
    expect(document.activeElement).toBe(mfaRow(panel).find("button").element);
  });

  it("keeps the new codes on show when the session ends right after turning on", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }))
      .mockResolvedValueOnce(
        jsonResponse(403, { error: "You must be logged in to perform this action." })
      );
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    // Logged out by the refresh, the page shows the gate, with the codes still above it.
    expect(isLoggedIn.value).toBe(false);
    expect(panel.find("h1").text()).toBe("Account");
    expect(panel.findAll(".codes__code").map((code) => code.text())).toEqual(CODES);
    expect(document.activeElement).toBe(panel.find("#codes-title").element);

    await keyNamed(panel, "I've saved them").trigger("click");
    await flushPromises();
    expect(panel.find(".codes").exists()).toBe(false);
    expect(panel.find(".gate").exists()).toBe(true);
  });

  it("shows the codes before the refresh answers", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }));
    const refresh = deferResponse(fetchMock);
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    expect(panel.findAll(".codes__code")).toHaveLength(10);
    refresh.respond(user(true, 10));
    await flushPromises();
    expect(panel.findAll(".codes__code")).toHaveLength(10);
  });

  it("drops unsaved codes once the method that made them is off again", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: ON, recoveryCodes: CODES }))
      .mockResolvedValueOnce(user(true, 10));
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();
    expect(panel.find(".codes").exists()).toBe(true);

    await mfaRow(panel).find("button").trigger("click");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { message: OFF }))
      .mockResolvedValueOnce(user(false));
    await mfaRow(panel).find('input[type="password"]').setValue("hunter22");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    expect(panel.find(".codes").exists()).toBe(false);
  });

  it("logs no expected refusal, e.g. a wrong password", async () => {
    const panel = await mountPanel();
    await mfaRow(panel).find("button").trigger("click");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    await mfaRow(panel).find('input[type="password"]').setValue("nope");
    await mfaRow(panel).find("form").trigger("submit");
    await flushPromises();

    expect(mfaRow(panel).find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(console.error).not.toHaveBeenCalled();
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
    expect(panel.find(".notice").text()).toBe(
      "E-mail codes are off: logins no longer ask for a mailed code."
    );
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
});
