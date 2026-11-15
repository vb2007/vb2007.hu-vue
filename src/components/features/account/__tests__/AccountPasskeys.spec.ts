import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import { Messages } from "@/constants/messages";
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
import { createPasskey, passkeysSupported } from "@/scripts/authentication/webauthn";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import type { Passkey } from "@/types/api/passkeys";

vi.mock("@/scripts/authentication/webauthn", () => ({
  passkeysSupported: vi.fn(),
  createPasskey: vi.fn()
}));

const LAPTOP: Passkey = {
  id: "cred-laptop",
  name: "Laptop",
  createdAt: "2026-11-01T10:00:00.000Z",
  lastUsedAt: null
};
const PHONE: Passkey = {
  id: "cred-phone",
  name: "Phone",
  createdAt: "2026-10-01T10:00:00.000Z",
  lastUsedAt: "2026-11-14T10:00:00.000Z"
};
const OPTIONS = { challenge: "abc", rp: { id: "vb2007.hu", name: "vb2007.hu" } };
const RESPONSE = { id: "cred-new" };
const NOT_FOUND = "There is no such passkey on this account.";

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

/** `GET /user` after a change, with `passkeys` counted. */
const user = (passkeys: number) =>
  jsonResponse(200, {
    _id: "0123456789abcdef01234567",
    username: "vb",
    email: "vb@example.com",
    hasPassword: true,
    emailVerified: true,
    mfa: { ...NO_MFA, passkeys }
  });
const list = (...passkeys: Passkey[]) => jsonResponse(200, { passkeys });

const mountPanel = async (...passkeys: Passkey[]) => {
  mfa.value = { ...NO_MFA, passkeys: passkeys.length };
  if (passkeys.length) fetchMock.mockResolvedValueOnce(list(...passkeys));
  ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
  await flushPromises();
  return wrapper!;
};

const section = (panel: VueWrapper) => panel.find('[aria-labelledby="passkeys-title"]');
const keyNamed = (panel: VueWrapper, text: string) =>
  section(panel)
    .findAll("button")
    .find((button) => (button.attributes("aria-label") ?? button.text()) === text)!;
const notice = (panel: VueWrapper) => panel.find(".notice");
const requestOf = (call: number) => fetchMock.mock.calls[call];

describe("AccountPanel's passkeys", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(passkeysSupported).mockReturnValue(true);
    vi.mocked(createPasskey).mockReset();
    vi.mocked(createPasskey).mockResolvedValue({ ok: true, response: RESPONSE });
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    username.value = "vb";
    userEmail.value = "vb@example.com";
    hasPassword.value = true;
    emailVerified.value = true;
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    mfa.value = { ...NO_MFA };
  });

  it("asks for no list without passkeys, and says they're no second step alone", async () => {
    const panel = await mountPanel();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(section(panel).find("h2").text()).toBe("Passkeys");
    expect(section(panel).text()).toContain("They don't turn on two-step login, but once it's on");
    expect(section(panel).find("ul").exists()).toBe(false);
    expect(keyNamed(panel, "Add a passkey").exists()).toBe(true);
  });

  it("says they answer the second step once a method is on", async () => {
    const panel = await mountPanel();
    mfa.value = { ...NO_MFA, email: true };
    await flushPromises();

    expect(section(panel).text()).toContain("They also answer two-step login's second step.");
  });

  it("lists the passkeys with when they were added and last used", async () => {
    const panel = await mountPanel(LAPTOP, PHONE);

    expect(requestOf(0)[0]).toBe("https://api.test/user/passkeys");
    const rows = section(panel).findAll("li");
    expect(rows.map((row) => row.find("h3").text())).toEqual(["Laptop", "Phone"]);
    expect(rows[0].find(".passkey__dates").text()).toMatch(/^Added .*Never used$/);
    expect(rows[1].find(".passkey__dates").text()).toMatch(/Last used/);
    expect(rows[0].findAll("button").map((button) => button.attributes("aria-label"))).toEqual([
      "Rename Laptop",
      "Delete Laptop"
    ]);
  });

  it("shows why the list didn't load", async () => {
    mfa.value = { ...NO_MFA, passkeys: 1 };
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
    await flushPromises();

    expect(section(wrapper!).find('[role="alert"]').text()).toBe(
      `${Messages.Passkeys.listFailed}: 500`
    );
  });

  it("keeps only the newest list when the count changes meanwhile", async () => {
    mfa.value = { ...NO_MFA, passkeys: 1 };
    const first = deferResponse(fetchMock);
    ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
    mfa.value = { ...NO_MFA, passkeys: 0 };
    await flushPromises();
    first.respond(list(LAPTOP));
    await flushPromises();

    expect(section(wrapper!).find("ul").exists()).toBe(false);
  });

  it("offers no Add key at the cap, or where the browser can't run the prompt", async () => {
    mfa.value = { ...NO_MFA, passkeys: 10 };
    fetchMock.mockResolvedValueOnce(list(LAPTOP));
    ({ wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body }));
    await flushPromises();
    expect(section(wrapper!).text()).toContain(Messages.Passkeys.atCap(10));
    expect(keyNamed(wrapper!, "Add a passkey")).toBeUndefined();
    wrapper!.unmount();

    vi.mocked(passkeysSupported).mockReturnValue(false);
    const panel = await mountPanel(LAPTOP);
    expect(section(panel).text()).toContain(Messages.Passkeys.unsupported);
    expect(keyNamed(panel, "Add a passkey")).toBeUndefined();
    expect(keyNamed(panel, "Rename Laptop").exists()).toBe(true);
  });

  describe("adding one", () => {
    const openAdd = async (panel: VueWrapper) => {
      await keyNamed(panel, "Add a passkey").trigger("click");
      await flushPromises();
    };

    it("asks for a name first, checked as it's typed", async () => {
      const panel = await mountPanel();
      await openAdd(panel);
      const field = section(panel).find("input");
      expect(document.activeElement).toBe(field.element);

      await keyNamed(panel, "Continue").trigger("click");
      await flushPromises();
      expect(section(panel).text()).toContain(Messages.Passkeys.nameMissing);

      await field.setValue("a".repeat(65));
      await field.trigger("blur");
      await flushPromises();
      expect(section(panel).text()).toContain(Messages.Passkeys.nameTooLong(64));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("confirms with the password, runs the prompt and adds it", async () => {
      const panel = await mountPanel();
      await openAdd(panel);
      await section(panel).find("input").setValue("  Work laptop ");
      await section(panel).find("form").trigger("submit");
      await flushPromises();
      expect(section(panel).text()).toContain(
        "Your browser then asks you to make the passkey “Work laptop”."
      );
      await section(panel).find('input[type="password"]').setValue("secret");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, OPTIONS))
        .mockResolvedValueOnce(
          jsonResponse(201, {
            message: "Passkey added successfully.",
            passkey: { ...LAPTOP, id: "cred-new", name: "Work laptop" }
          })
        )
        .mockResolvedValueOnce(user(1))
        .mockResolvedValueOnce(list({ ...LAPTOP, id: "cred-new", name: "Work laptop" }));

      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(requestOf(0)[0]).toBe("https://api.test/user/passkeys/options");
      expect(requestOf(0)[1]?.body).toBe(JSON.stringify({ password: "secret" }));
      expect(createPasskey).toHaveBeenCalledWith(OPTIONS);
      expect(requestOf(1)[0]).toBe("https://api.test/user/passkeys");
      expect(requestOf(1)[1]?.body).toBe(
        JSON.stringify({ name: "Work laptop", response: RESPONSE })
      );
      expect(notice(panel).text()).toBe("Passkey added successfully.");
      expect(document.activeElement).toBe(notice(panel).element);
      expect(section(panel).find("li h3").text()).toBe("Work laptop");
    });

    it("stays on the confirmation, quietly, when the prompt is cancelled", async () => {
      const panel = await mountPanel();
      await openAdd(panel);
      await section(panel).find("input").setValue("Phone");
      await section(panel).find("form").trigger("submit");
      await flushPromises();
      await section(panel).find('input[type="password"]').setValue("secret");
      fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
      vi.mocked(createPasskey).mockResolvedValueOnce({ ok: false, error: "" });

      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(section(panel).find('[role="alert"]').exists()).toBe(false);
      expect(keyNamed(panel, "Add passkey").exists()).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("shows the browser's and the API's refusals on the confirmation", async () => {
      const panel = await mountPanel();
      await openAdd(panel);
      await section(panel).find("input").setValue("Phone");
      await section(panel).find("form").trigger("submit");
      await flushPromises();
      await section(panel).find('input[type="password"]').setValue("secret");
      fetchMock.mockResolvedValueOnce(jsonResponse(200, OPTIONS));
      vi.mocked(createPasskey).mockResolvedValueOnce({
        ok: false,
        error: Messages.Passkeys.alreadyOnDevice
      });
      await section(panel).find("form").trigger("submit");
      await flushPromises();
      expect(section(panel).find('[role="alert"]').text()).toBe(Messages.Passkeys.alreadyOnDevice);

      const cap = "An account can have at most 10 passkeys: delete one first.";
      fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: cap }));
      await section(panel).find("form").trigger("submit");
      await flushPromises();
      expect(section(panel).find('[role="alert"]').text()).toBe(cap);
    });

    it("goes back to the name from the confirmation, and closes from there", async () => {
      const panel = await mountPanel();
      await openAdd(panel);
      await section(panel).find("input").setValue("Phone");
      await section(panel).find("form").trigger("submit");
      await flushPromises();

      await keyNamed(panel, "Cancel").trigger("click");
      await flushPromises();
      const field = section(panel).find("input");
      expect((field.element as HTMLInputElement).value).toBe("Phone");
      expect(document.activeElement).toBe(field.element);

      await section(panel).find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(document.activeElement).toBe(keyNamed(panel, "Add a passkey").element);
    });
  });

  describe("renaming one", () => {
    const openRename = async (panel: VueWrapper) => {
      await keyNamed(panel, "Rename Laptop").trigger("click");
      await flushPromises();
      return section(panel).find("input");
    };

    it("opens a field with the name selected, and saves the new one", async () => {
      const panel = await mountPanel(LAPTOP);
      const field = await openRename(panel);
      expect((field.element as HTMLInputElement).value).toBe("Laptop");
      expect(document.activeElement).toBe(field.element);

      await field.setValue("Old laptop");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: "Passkey renamed successfully." }))
        .mockResolvedValueOnce(list({ ...LAPTOP, name: "Old laptop" }));
      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(requestOf(1)[0]).toBe("https://api.test/user/passkeys/cred-laptop");
      expect(requestOf(1)[1]).toMatchObject({
        method: "PATCH",
        body: JSON.stringify({ name: "Old laptop" })
      });
      expect(notice(panel).text()).toBe("Passkey renamed successfully.");
      expect(section(panel).find("li h3").text()).toBe("Old laptop");
    });

    it("closes without asking for the same name, and puts the focus back", async () => {
      const panel = await mountPanel(LAPTOP);
      await openRename(panel);

      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledOnce();
      expect(document.activeElement).toBe(keyNamed(panel, "Rename Laptop").element);
    });

    it("shows the API's refusal of the name on the field", async () => {
      const refused =
        "The passkey name can't contain line breaks or invisible formatting characters.";
      const panel = await mountPanel(LAPTOP);
      const field = await openRename(panel);
      await field.setValue("Lap​top");
      fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: refused }));

      await section(panel).find("form").trigger("submit");
      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(section(panel).find(".field__error, [id$='-error']").text()).toBe(refused);
      expect(document.activeElement).toBe(field.element);
      expect(console.error).not.toHaveBeenCalled();
    });

    it("looks the account up again when the passkey is gone", async () => {
      const panel = await mountPanel(LAPTOP);
      const field = await openRename(panel);
      await field.setValue("Old laptop");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { error: NOT_FOUND }))
        .mockResolvedValueOnce(user(0));

      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(notice(panel).text()).toBe(NOT_FOUND);
      expect(section(panel).find("ul").exists()).toBe(false);
    });
  });

  describe("deleting one", () => {
    it("confirms with the password, saying the browser keeps its copy", async () => {
      const panel = await mountPanel(LAPTOP, PHONE);
      await keyNamed(panel, "Delete Laptop").trigger("click");
      await flushPromises();
      expect(section(panel).text()).toContain(
        "your browser or password manager keeps its copy until you remove it there"
      );
      await section(panel).find('input[type="password"]').setValue("secret");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: "Passkey deleted successfully." }))
        .mockResolvedValueOnce(user(1))
        .mockResolvedValueOnce(list(PHONE));

      await section(panel).find("form").trigger("submit");
      await flushPromises();

      expect(requestOf(1)[0]).toBe("https://api.test/user/passkeys/cred-laptop");
      expect(requestOf(1)[1]).toMatchObject({
        method: "DELETE",
        body: JSON.stringify({ password: "secret" })
      });
      expect(notice(panel).text()).toBe("Passkey deleted successfully.");
      expect(
        section(panel)
          .findAll("li h3")
          .map((name) => name.text())
      ).toEqual(["Phone"]);
    });

    it("goes back to its keys on Cancel", async () => {
      const panel = await mountPanel(LAPTOP);
      await keyNamed(panel, "Delete Laptop").trigger("click");
      await flushPromises();

      await keyNamed(panel, "Cancel").trigger("click");
      await flushPromises();

      expect(document.activeElement).toBe(keyNamed(panel, "Delete Laptop").element);
    });
  });
});
