import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import LoginForm from "@/components/features/auth/LoginForm.vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { passkeyLogin } from "@/scripts/authentication/passkeys";
import { passkeysSupported } from "@/scripts/authentication/webauthn";
import { loginStatus, restoreSession } from "@/scripts/authentication/user";
import { mountWithRouter } from "@/__tests__/helpers/mount";

vi.mock("@/scripts/authentication/user", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/user")>()),
  restoreSession: vi.fn()
}));
vi.mock("@/scripts/authentication/passkeys", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/scripts/authentication/passkeys")>()),
  passkeyLogin: vi.fn()
}));
vi.mock("@/scripts/authentication/webauthn", () => ({ passkeysSupported: vi.fn() }));

const INVALID = "The passkey couldn't be verified: try again or log in another way.";
const LIMITED = "Too many passkey requests: try again later.";

let wrapper: VueWrapper | undefined;

const mountForm = async () => {
  ({ wrapper } = await mountWithRouter(LoginForm, { attachTo: document.body }));
  return wrapper!;
};
const passkeyKey = (form: VueWrapper) => form.find(".passkey button");

describe("LoginForm's passkey", () => {
  beforeEach(() => {
    vi.mocked(restoreSession).mockReset();
    vi.mocked(passkeyLogin).mockReset();
    vi.mocked(passkeysSupported).mockReturnValue(true);
    isLoggedIn.value = false;
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    loginStatus.value = "";
    isLoggedIn.value = false;
  });

  it("offers a passkey under GitHub", async () => {
    const form = await mountForm();

    expect(passkeyKey(form).text()).toBe("Log in with a passkey");
    expect(form.find(".github + .passkey").exists()).toBe(true);
  });

  it("offers none where the browser can't run the prompt", async () => {
    vi.mocked(passkeysSupported).mockReturnValue(false);
    const form = await mountForm();

    expect(form.find(".passkey").exists()).toBe(false);
  });

  it("logs in, showing progress meanwhile", async () => {
    let finish!: () => void;
    vi.mocked(passkeyLogin).mockReturnValueOnce(
      new Promise((resolve) => (finish = () => resolve(undefined)))
    );
    const form = await mountForm();

    // Twice before the key turns busy: one try.
    (passkeyKey(form).element as HTMLButtonElement).click();
    (passkeyKey(form).element as HTMLButtonElement).click();
    await form.vm.$nextTick();
    expect(passkeyKey(form).text()).toBe("Logging in");
    expect(passkeyLogin).toHaveBeenCalledOnce();

    isLoggedIn.value = true;
    finish();
    await flushPromises();
    expect(form.text()).toContain("Login successful!");
  });

  it("shows its own refusal whatever address is typed, the key taking the focus back", async () => {
    vi.mocked(passkeyLogin).mockResolvedValueOnce({ error: INVALID });
    const form = await mountForm();
    await form.find('input[type="email"]').setValue("someone@example.com");

    await passkeyKey(form).trigger("click");
    await flushPromises();

    expect(form.find(".passkey [role='alert']").text()).toBe(INVALID);
    expect(document.activeElement).toBe(passkeyKey(form).element);
  });

  it("says nothing for a cancelled prompt", async () => {
    vi.mocked(passkeyLogin).mockResolvedValueOnce({ error: "" });
    const form = await mountForm();

    await passkeyKey(form).trigger("click");
    await flushPromises();

    expect(form.find(".passkey [role='alert']").exists()).toBe(false);
  });

  it("holds its key for the 429's wait, its message taking the focus", async () => {
    vi.mocked(passkeyLogin).mockResolvedValueOnce({ error: LIMITED, wait: 42 });
    const form = await mountForm();

    await passkeyKey(form).trigger("click");
    await flushPromises();

    expect(passkeyKey(form).text()).toBe("Try again in 42 sec");
    expect(passkeyKey(form).attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(form.find(".passkey [role='alert']").element);
    // The password form's own key isn't held.
    expect(form.find('button[type="submit"]').attributes("disabled")).toBeUndefined();
  });
});
