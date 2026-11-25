import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import AdminResetMfa from "@/components/features/admin/AdminResetMfa.vue";
import { Messages } from "@/constants/messages";
import type { AdminUserDetails } from "@/types/api/admin";
import type { MfaStatus } from "@/types/api/user";
import { anAdminUserDetails, anApiKey } from "@/__tests__/helpers/admin";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

enableAutoUnmount(afterEach);

const RESET = "User's MFA reset successfully: every method is off and their session was ended.";

const withMfa = (mfa: Partial<MfaStatus>, apiKeys = [anApiKey("k1")]) =>
  anAdminUserDetails("a", {
    mfa: { email: false, totp: false, passkeys: 0, recoveryCodesLeft: 0, ...mfa },
    apiKeys
  });

describe("AdminResetMfa", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  /** Takes the emitted account back in, like the page's `applyUser`. */
  const mountRow = (user: AdminUserDetails) => {
    const wrapper: VueWrapper = mount(AdminResetMfa, {
      props: {
        user,
        onUpdated: (updated: AdminUserDetails) => wrapper.setProps({ user: updated })
      },
      attachTo: document.body
    });
    return wrapper;
  };

  const keys = (wrapper: VueWrapper) => wrapper.findAll("button").map((key) => key.text());
  const note = (wrapper: VueWrapper) => wrapper.find(".action__note").text().replace(/\s+/g, " ");

  it("explains what a reset does, behind a Reset MFA key", () => {
    const wrapper = mountRow(withMfa({ totp: true, recoveryCodesLeft: 10 }));

    expect(wrapper.find("h3").text()).toBe("Reset MFA");
    expect(note(wrapper)).toBe(
      "For when user-a lost their second factor: turns off every MFA method and recovery code, deletes their API keys and ends their session. Their passkeys stay."
    );
    expect(keys(wrapper)).toEqual(["Reset MFA"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["nothing", {}],
    ["only passkeys", { passkeys: 2 }]
  ])("has no key with %s on, and says so", (_, mfa) => {
    const wrapper = mountRow(withMfa(mfa));

    expect(note(wrapper)).toBe("user-a has no MFA method on, so there's nothing to reset.");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("has no key on the admin's own account, and says where its MFA is managed", () => {
    const wrapper = mountRow({
      ...withMfa({ totp: true, recoveryCodesLeft: 10 }),
      isSuperuser: true
    });

    expect(note(wrapper)).toBe(Messages.Admin.superuserMfaNotResettable);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("offers a reset while recovery codes are left, even with no method on", () => {
    expect(keys(mountRow(withMfa({ recoveryCodesLeft: 3 })))).toEqual(["Reset MFA"]);
  });

  it("asks before resetting, and Cancel or Escape backs out without a request", async () => {
    const wrapper = mountRow(withMfa({ email: true }));

    await wrapper.find("button").trigger("click");
    expect(wrapper.find(".confirm__text").text().replace(/\s+/g, " ")).toBe(
      "Reset user-a's MFA? Every method and recovery code is turned off, their API keys are deleted, and they're logged out at once and mailed a security notice. They log in without a second step (password, GitHub or a passkey) and can turn MFA on again."
    );
    expect(keys(wrapper)).toEqual(["Reset user-a's MFA", "Cancel"]);
    expect(document.activeElement?.textContent?.trim()).toBe("Reset user-a's MFA");
    expect(wrapper.find("button[type=submit]").attributes("aria-describedby")).toBeUndefined();

    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.find(".confirm").exists()).toBe(false);
    expect(document.activeElement?.textContent?.trim()).toBe("Reset MFA");

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find(".confirm").exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("resets once confirmed: everything but the passkeys goes off, API keys too, and the focus moves to the word", async () => {
    const wrapper = mountRow(
      withMfa({ email: true, totp: true, passkeys: 2, recoveryCodesLeft: 7 })
    );
    const response = deferResponse(fetchMock);

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(keys(wrapper)).toEqual(["Resetting", "Cancel"]);
    // Busy, the confirmation stays: Escape and Cancel wait for the answer.
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.find(".confirm").exists()).toBe(true);

    response.respond(jsonResponse(200, { message: RESET }));
    await flushPromises();

    const [call] = fetchMock.mock.calls;
    expect(String(call[0])).toBe("https://api.test/admin/users/a/mfa");
    expect(call[1]?.method).toBe("DELETE");
    expect(wrapper.emitted("updated")).toEqual([
      [withMfa({ email: false, totp: false, passkeys: 2, recoveryCodesLeft: 0 }, [])]
    ]);
    expect(wrapper.find(".confirm").exists()).toBe(false);
    // Not "nothing to reset" over the word that it was just reset.
    expect(note(wrapper)).toMatch(/^For when user-a lost their second factor/);
    const done = wrapper.find(".outcome.status--success");
    expect(done.text()).toBe(Messages.Admin.mfaReset("user-a"));
    expect(document.activeElement).toBe(done.element);
  });

  it("keeps the confirmation open with the refusal in it", async () => {
    const wrapper = mountRow(withMfa({ email: true }));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that ID." })
    );

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const refusal = wrapper.find(".confirm .status--error");
    expect(refusal.text()).toBe("There is no such user with that ID.");
    expect(wrapper.emitted("updated")).toBeUndefined();
    const confirmKey = wrapper.find("button[type=submit]");
    expect(document.activeElement).toBe(confirmKey.element);
    expect(confirmKey.attributes("aria-describedby")).toBe(refusal.attributes("id"));

    // Cancel takes the refusal along.
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("falls back to its own failure when the API sends no word", async () => {
    const wrapper = mountRow(withMfa({ email: true }));
    fetchMock.mockResolvedValueOnce(jsonResponse(500, undefined, "Server Error"));

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".confirm .status--error").text()).toBe(
      `${Messages.Admin.mfaResetFailed}: Server Error`
    );
  });
});
