import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type DOMWrapper, type VueWrapper } from "@vue/test-utils";
import ApiKeysPanel from "@/components/features/account/ApiKeysPanel.vue";
import { Messages } from "@/constants/messages";
import {
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  sessionEnded,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { takeGithubReturn } from "@/scripts/authentication/githubReturn";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import type { ApiKey } from "@/types/api/apiKeys";

const BUDGET = "No more e-mails can be sent today: please try again after the daily limit resets.";
const DEPLOY: ApiKey = {
  id: "3f0c9a7e5b1d4c2a8e6f0b9d7c5a3e1f",
  name: "Deploy bot",
  hint: "x9Qk",
  scopes: ["pastes:read", "pastes:write"],
  createdAt: "2099-11-21T10:00:00.000Z",
  expiresAt: "2100-02-19T10:00:00.000Z",
  lastUsedAt: null
};
const OLD: ApiKey = {
  id: "0123456789abcdef0123456789abcdef",
  name: "Old script",
  hint: "AbCd",
  scopes: ["account:read"],
  createdAt: "2025-01-01T10:00:00.000Z",
  expiresAt: "2025-01-02T10:00:00.000Z",
  lastUsedAt: "2025-01-01T12:00:00.000Z"
};
const FOREVER: ApiKey = { ...DEPLOY, id: "f".repeat(32), name: "Forever", expiresAt: null };
const TOKEN = `vbk_${"A".repeat(39)}Zz9_`;
const CREATED = "API key created: store the token somewhere safe, it isn't shown again.";
const ROTATED =
  "API key rotated, and the old token no longer works: store the new one somewhere safe, it isn't shown again.";
const GONE = "There is no such API key on this account.";
const CHANGED =
  "The API key was changed by another request at the same time: list the keys and try again.";
const CAP = "An account can have at most 10 API keys: delete one first.";
const SPOTDL = jsonResponse(200, { id: "spotdl", name: "spotdl-web", scopes: ["spotdl:submit"] });
const NO_CLIENT = jsonResponse(404, { error: "There is no such OAuth client." });

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;

const list = (...apiKeys: ApiKey[]) => jsonResponse(200, { apiKeys });
const withToken = (apiKey: ApiKey, message: string) =>
  jsonResponse(201, { message, apiKey: { ...apiKey, token: TOKEN } });

const mountPanel = async (...apiKeys: ApiKey[]) => {
  fetchMock.mockResolvedValueOnce(list(...apiKeys));
  ({ wrapper } = await mountWithRouter(
    ApiKeysPanel,
    { attachTo: document.body },
    "/account/api-keys"
  ));
  await flushPromises();
  return wrapper!;
};

const key = (panel: VueWrapper | DOMWrapper<Element>, text: string) =>
  panel
    .findAll("button")
    .find((button) => (button.attributes("aria-label") ?? button.text()).trim() === text)!;
const rows = (panel: VueWrapper) => panel.findAll(".api-key");
const notice = (panel: VueWrapper) => panel.find(".notice");
const bodyOf = (call: number) => JSON.parse(fetchMock.mock.calls[call][1]!.body as string);
const urlOf = (call: number) => fetchMock.mock.calls[call][0];
const methodOf = (call: number) => fetchMock.mock.calls[call][1]!.method;
const checkbox = (panel: VueWrapper, area: string, label: "Read" | "Write") =>
  panel
    .find(`[role="group"][aria-label="${area}"]`)
    .findAll("label")
    .find((each) => each.text() === label)!
    .find("input");

/** Opens "Create an API key" and fills it in, up to the password. */
const fillCreate = async (panel: VueWrapper, name = "Deploy bot") => {
  await key(panel, "Create an API key").trigger("click");
  await panel.find(".key-form input").setValue(name);
  await checkbox(panel, "Pastes", "Write").setValue(true);
  await checkbox(panel, "Pastes", "Read").setValue(true);
  await panel.find(".key-form").trigger("submit");
  await flushPromises();
};

const confirm = async (panel: VueWrapper, password = "secret") => {
  await panel.find('.reauth input[type="password"]').setValue(password);
  await panel.find(".reauth").trigger("submit");
  await flushPromises();
};

describe("ApiKeysPanel", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    sessionEnded.value = false;
    username.value = "vb";
    userEmail.value = "vb@example.com";
    hasPassword.value = true;
    isSuperuser.value = false;
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    isLoggedIn.value = false;
    sessionEnded.value = false;
  });

  it("lists the keys with their hint, scopes and dates", async () => {
    const panel = await mountPanel(DEPLOY, OLD, FOREVER);

    expect(urlOf(0)).toBe("https://api.test/user/api-keys");
    expect(panel.find("h1").text()).toBe("API keys");
    expect(panel.find('ul[aria-label="Your API keys"]').exists()).toBe(true);
    const [deploy, old, forever] = rows(panel);
    expect(deploy.find("h3").text()).toBe("Deploy bot");
    expect(deploy.find(".api-key__hint").text()).toBe("Token ending in …x9Qk");
    expect(deploy.findAll(".api-key__scope").map((scope) => scope.text())).toEqual([
      "pastes:read",
      "pastes:write"
    ]);
    expect(deploy.find(".api-key__dates").text()).toMatch(
      /^Created .*,  ·\u00a0Expires .*,  ·\u00a0Never used$/
    );
    expect(deploy.text()).not.toContain("Expired");
    expect(old.find(".api-key__head").text()).toContain("Expired");
    expect(old.find(".api-key__dates").text()).toMatch(/Expired .*Last used/);
    expect(forever.find(".api-key__dates").text()).toContain("Never expires");
    expect(key(panel, "Rotate Deploy bot").exists()).toBe(true);
  });

  it("says there are none yet, and offers to create one", async () => {
    const panel = await mountPanel();

    expect(panel.text()).toContain("No API keys yet.");
    expect(key(panel, "Create an API key").exists()).toBe(true);
  });

  it("shows a failed load", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));
    ({ wrapper } = await mountWithRouter(ApiKeysPanel, {}, "/account/api-keys"));
    await flushPromises();

    expect(wrapper!.find(".status--error").text()).toContain(Messages.ApiKeys.listFailed);
    expect(wrapper!.text()).not.toContain("No API keys yet.");
  });

  it("gives way to a line at the cap", async () => {
    const ten = Array.from({ length: 10 }, (_, i) => ({ ...DEPLOY, id: `${i}`.repeat(32) }));
    const panel = await mountPanel(...ten);

    expect(key(panel, "Create an API key")).toBeUndefined();
    expect(panel.text()).toContain(Messages.ApiKeys.atCap(10));
  });

  it("explains on the gate a relink that came back logged out", async () => {
    isLoggedIn.value = false;
    ({ wrapper } = await mountWithRouter(
      ApiKeysPanel,
      {},
      "/account/api-keys?oauthError=notLoggedIn"
    ));

    expect(wrapper!.find(".gate .status--error").text()).toContain("Your session ended");
    expect(wrapper!.text()).toContain("Log in to manage your API keys.");
  });

  it("gates a visitor without asking for keys", async () => {
    isLoggedIn.value = false;
    ({ wrapper } = await mountWithRouter(ApiKeysPanel, {}, "/account/api-keys"));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper!.text()).toContain("Log in to manage your API keys.");
  });

  it("drops the list and a load still on its way on logout", async () => {
    const pending = deferResponse(fetchMock);
    ({ wrapper } = await mountWithRouter(ApiKeysPanel, {}, "/account/api-keys"));
    isLoggedIn.value = false;
    await flushPromises();
    pending.respond(list(DEPLOY));
    await flushPromises();
    isLoggedIn.value = true;
    fetchMock.mockResolvedValueOnce(list());
    await flushPromises();

    expect(wrapper!.text()).toContain("No API keys yet.");
  });

  describe("creating", () => {
    it("checks the details before asking for the password", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      expect(document.activeElement).toBe(panel.find(".key-form input").element);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();

      expect(panel.text()).toContain(Messages.ApiKeys.nameMissing);
      expect(panel.text()).toContain(Messages.ApiKeys.scopesMissing);
      expect(panel.find(".reauth").exists()).toBe(false);

      await panel.find(".key-form input").setValue("a".repeat(65));
      expect(panel.text()).toContain(Messages.ApiKeys.nameTooLong(64));
      const days = panel.find('input[inputmode="numeric"]');
      expect((days.element as HTMLInputElement).value).toBe("90");
      await days.setValue("366");
      await panel.find(".key-form").trigger("submit");
      expect(panel.text()).toContain(Messages.ApiKeys.lifetimeInvalid(1, 365));
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("shows a field's problem once it's left", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      const name = panel.find(".key-form input");
      await name.setValue(" ");
      expect(panel.text()).not.toContain(Messages.ApiKeys.nameMissing);
      await name.trigger("blur");
      expect(panel.text()).toContain(Messages.ApiKeys.nameMissing);
      const days = panel.find('input[inputmode="numeric"]');
      await days.setValue("0");
      await days.trigger("blur");
      expect(panel.text()).toContain(Messages.ApiKeys.lifetimeInvalid(1, 365));
    });

    it("offers the admin scopes to the superuser only", async () => {
      let panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      expect(panel.find('[aria-label="Admin"]').exists()).toBe(false);
      expect(
        panel.findAll('[role="group"]').map((group) => group.attributes("aria-label"))
      ).toEqual(["Account", "Pastes", "Short links", "Uploads"]);
      wrapper!.unmount();

      isSuperuser.value = true;
      panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      expect(panel.find('[aria-label="Admin"]').exists()).toBe(true);
    });

    it("sends the trimmed name, the scopes in the API's order and the lifetime, then shows the token once", async () => {
      const panel = await mountPanel();
      await fillCreate(panel, "  Deploy bot ");
      expect(document.activeElement).toBe(panel.find('input[type="password"]').element);
      expect(panel.text()).toContain("The key's token then shows only once.");
      fetchMock.mockResolvedValueOnce(withToken(DEPLOY, CREATED));
      const pending = deferResponse(fetchMock);
      await confirm(panel);

      expect(urlOf(1)).toBe("https://api.test/user/api-keys");
      expect(methodOf(1)).toBe("POST");
      expect(bodyOf(1)).toEqual({
        password: "secret",
        name: "Deploy bot",
        scopes: ["pastes:read", "pastes:write"],
        expiresInDays: 90
      });
      // The token shows while the list is still on its way.
      expect(panel.find(".token__text").text()).toBe(TOKEN);
      expect(panel.find(".token").text()).toContain(CREATED);
      expect(panel.find(".token").text()).toContain("it won't be shown again");
      expect(panel.find(".token__usage").text()).toBe(
        'curl -H "Authorization: Bearer vbk_…" https://api.test/user'
      );
      expect(document.activeElement).toBe(panel.find(".token__title").element);
      expect(panel.find(".key-form").exists()).toBe(false);

      pending.respond(list(DEPLOY));
      await flushPromises();
      expect(rows(panel)).toHaveLength(1);
      expect(panel.find(".token").exists()).toBe(true);

      await key(panel, "I've saved it").trigger("click");
      await flushPromises();
      expect(panel.find(".token").exists()).toBe(false);
      expect(document.activeElement).toBe(key(panel, "Create an API key").element);
    });

    it("sends null for a key that never expires", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      await panel.find(".key-form input").setValue("Forever");
      await checkbox(panel, "Account", "Read").setValue(true);
      await panel.find(".key-form select").setValue("never");
      expect(panel.text()).toContain("It works until you delete or rotate it.");
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(withToken(FOREVER, CREATED))
        .mockResolvedValueOnce(list(FOREVER));
      await confirm(panel);

      expect(bodyOf(1).expiresInDays).toBeNull();
      expect(bodyOf(1).scopes).toEqual(["account:read"]);
    });

    it("unticks a scope", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      await checkbox(panel, "Uploads", "Read").setValue(true);
      await checkbox(panel, "Uploads", "Read").setValue(false);
      await panel.find(".key-form").trigger("submit");

      expect(panel.text()).toContain(Messages.ApiKeys.scopesMissing);
    });

    it("goes back to the details, kept, from the confirmation, and Cancel closes it", async () => {
      const panel = await mountPanel();
      await fillCreate(panel);
      await key(panel, "Cancel").trigger("click");
      await flushPromises();

      expect((panel.find(".key-form input").element as HTMLInputElement).value).toBe("Deploy bot");
      expect(document.activeElement).toBe(panel.find(".key-form input").element);
      await panel.find(".key-form").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(panel.find(".key-form").exists()).toBe(false);
      expect(document.activeElement).toBe(key(panel, "Create an API key").element);
    });

    it("keeps the form with the cap's 409 and reloads the list", async () => {
      const panel = await mountPanel();
      await fillCreate(panel);
      const ten = Array.from({ length: 10 }, (_, i) => ({ ...OLD, id: `${i}`.repeat(32) }));
      fetchMock
        .mockResolvedValueOnce(jsonResponse(409, { error: CAP }))
        .mockResolvedValueOnce(list(...ten));
      await confirm(panel);

      expect(panel.find(".reauth").text()).toContain(CAP);
      expect(urlOf(2)).toBe("https://api.test/user/api-keys");
      expect(rows(panel)).toHaveLength(10);
      expect(console.error).not.toHaveBeenCalled();

      // Cancelled back out, there's no create key to return to: the cap's line takes the focus.
      await key(panel, "Cancel").trigger("click");
      await flushPromises();
      await key(panel, "Cancel").trigger("click");
      await flushPromises();
      expect(document.activeElement?.textContent?.trim()).toBe(Messages.ApiKeys.atCap(10));
    });

    it("puts the cursor in the first scope when only the scopes are missing", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");
      await panel.find(".key-form input").setValue("CI");
      await panel.find(".key-form").trigger("submit");
      await flushPromises();

      expect(panel.find(".key-form__error").attributes("role")).toBe("alert");
      expect(document.activeElement).toBe(checkbox(panel, "Account", "Read").element);
    });

    it("holds the key through the security notices' 429", async () => {
      const panel = await mountPanel();
      await fillCreate(panel);
      fetchMock.mockResolvedValueOnce(
        jsonResponse(429, { error: "Too many security notices…", retryAfter: 3600 })
      );
      await confirm(panel);

      expect(panel.find(".reauth").text()).toContain("Too many security notices…");
      expect(key(panel, "Try again in 1 hr").attributes("disabled")).toBeDefined();
    });

    it("holds the key quietly through the day's used-up mail, keeping the details", async () => {
      const panel = await mountPanel();
      await fillCreate(panel);
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: BUDGET, retryAfter: 3600, reason: "mailBudget" })
      );
      await confirm(panel);

      expect(panel.find(".reauth").text()).toContain(BUDGET);
      expect(key(panel, "Try again in 1 hr").attributes("disabled")).toBeDefined();
      expect(console.error).not.toHaveBeenCalled();
      await key(panel, "Cancel").trigger("click");
      await flushPromises();
      expect((panel.find(".key-form input").element as HTMLInputElement).value).toBe("Deploy bot");
    });

    it("offers GitHub to an account without a password, coming back to the form as it was", async () => {
      hasPassword.value = false;
      fetchMock.mockResolvedValueOnce(list());
      const { wrapper: panel, router } = await mountWithRouter(
        ApiKeysPanel,
        { attachTo: document.body },
        "/account/api-keys"
      );
      wrapper = panel;
      await flushPromises();
      await fillCreate(panel);
      expect(panel.find('input[type="password"]').exists()).toBe(false);
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, {
          error:
            "Confirm it's you first: log in with GitHub again (or relink it), then create or rotate the API key within 10 minutes."
        })
      );
      await panel.find(".reauth").trigger("submit");
      await flushPromises();

      expect(bodyOf(1)).not.toHaveProperty("password");
      expect(panel.find(".reauth a").text()).toContain("Confirm with GitHub");
      await panel.find(".reauth a").trigger("click");
      const back = router.resolve(takeGithubReturn());
      expect(back.path).toBe("/account/api-keys");
      expect(back.query).toEqual({
        newApiKey: "1",
        name: "Deploy bot",
        scopes: "pastes:read,pastes:write"
      });
    });

    it("says GitHub confirmed it, back from the relink", async () => {
      fetchMock.mockResolvedValueOnce(list());
      const { wrapper: panel, router } = await mountWithRouter(
        ApiKeysPanel,
        {},
        "/account/api-keys?github=linked"
      );
      wrapper = panel;
      await flushPromises();

      expect(panel.find(".notice").text()).toBe(Messages.ApiKeys.githubConfirmed(10));
      expect(router.currentRoute.value.query).toEqual({});
      await key(panel, "Create an API key").trigger("click");
      expect(panel.find(".notice").exists()).toBe(false);
    });

    it("explains a relink GitHub refused", async () => {
      fetchMock.mockResolvedValueOnce(list());
      ({ wrapper } = await mountWithRouter(
        ApiKeysPanel,
        {},
        "/account/api-keys?oauthError=accessDenied"
      ));
      await flushPromises();

      expect(wrapper!.find(".status--error").text()).toContain("GitHub login was cancelled");
    });
  });

  describe("the deep link", () => {
    const LINK =
      "/account/api-keys?newApiKey=1&name=Deploy%20bot&scopes=pastes:write,pastes:read&tab=x";
    const linked = (scopes: string) =>
      `/account/api-keys?newApiKey=1&name=Bot&scopes=${encodeURIComponent(scopes)}`;

    /** `lookups` answers the link's apps' `GET /oauth/clients/:clientId`, in the link's order. */
    const mountLinked = async (path: string, apiKeys: ApiKey[] = [], ...lookups: Response[]) => {
      fetchMock.mockResolvedValueOnce(list(...apiKeys));
      for (const lookup of lookups) fetchMock.mockResolvedValueOnce(lookup);
      const mounted = await mountWithRouter(ApiKeysPanel, { attachTo: document.body }, path);
      wrapper = mounted.wrapper;
      await flushPromises();
      return mounted;
    };
    const ticked = (panel: VueWrapper) =>
      panel.findAll('.key-form__scopes [role="group"]').flatMap((group) =>
        group
          .findAll("label")
          .filter((label) => (label.find("input").element as HTMLInputElement).checked)
          .map((label) => `${group.attributes("aria-label")} ${label.text()}`)
      );
    const leftOut = (panel: VueWrapper) => panel.find(".key-form__scopes .status--info");

    it("opens the create form filled in, keeps the default lifetime, and creating drops its query", async () => {
      const { wrapper: panel, router } = await mountLinked(LINK);

      expect((panel.find(".key-form input").element as HTMLInputElement).value).toBe("Deploy bot");
      expect(document.activeElement).toBe(panel.find(".key-form input").element);
      expect(ticked(panel)).toEqual(["Pastes Read", "Pastes Write"]);
      expect(leftOut(panel).exists()).toBe(false);
      expect(panel.find("select").element).toHaveProperty("value", "days");
      expect(panel.find('input[inputmode="numeric"]').element).toHaveProperty("value", "90");

      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(withToken(DEPLOY, CREATED));
      fetchMock.mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);

      expect(bodyOf(1)).toEqual({
        password: "secret",
        name: "Deploy bot",
        scopes: ["pastes:read", "pastes:write"],
        expiresInDays: 90
      });
      expect(panel.find(".token__text").text()).toBe(TOKEN);
      expect(router.currentRoute.value.query).toEqual({ tab: "x" });
    });

    it("leaves out, and names, the admin and unknown scopes for an account that isn't the superuser", async () => {
      const { wrapper: panel } = await mountLinked(
        linked("admin:read,spotdl:submit,uploads:read"),
        [],
        NO_CLIENT
      );

      expect(ticked(panel)).toEqual(["Uploads Read"]);
      expect(panel.find('[role="group"][aria-label="Admin"]').exists()).toBe(false);
      expect(leftOut(panel).text()).toBe(
        Messages.ApiKeys.scopesLeftOut(["admin:read", "spotdl:submit"], 0)
      );
      // Already there when the form opens, so the fieldset says it rather than a live region.
      expect(panel.find(".key-form__scopes").attributes("aria-describedby")).toBe(
        leftOut(panel).attributes("id")
      );
    });

    it("offers the app scopes the API knows, ticked and labelled with the app's name", async () => {
      const { wrapper: panel } = await mountLinked(
        linked("spotdl:submit,uploads:read,spotdl:read,kiwix:search,admin:read"),
        [],
        SPOTDL,
        NO_CLIENT
      );

      // One lookup per app, without the session cookie; never one for a built-in area.
      expect(fetchMock.mock.calls.slice(1).map(([url]) => url)).toEqual([
        "https://api.test/oauth/clients/spotdl",
        "https://api.test/oauth/clients/kiwix"
      ]);
      expect(fetchMock.mock.calls[1][1]!.credentials).toBeUndefined();
      expect(ticked(panel)).toEqual(["Uploads Read", "Apps spotdl-web: submit"]);
      const apps = panel.find('[role="group"][aria-label="Apps"]');
      expect(panel.get(`#${apps.attributes("aria-describedby")}`).text()).toBe(
        "Each only lets that app check the key and see your username and e-mail. It grants nothing on vb2007.hu."
      );
      expect(leftOut(panel).text()).toBe(
        Messages.ApiKeys.scopesLeftOut(["spotdl:read", "kiwix:search", "admin:read"], 0)
      );
      expect(console.error).not.toHaveBeenCalled();

      // Ticking an area's box keeps the app's, which goes last, like the API lists it.
      await checkbox(panel, "Uploads", "Read").setValue(false);
      await checkbox(panel, "Pastes", "Write").setValue(true);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(withToken(DEPLOY, CREATED));
      fetchMock.mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);

      expect(bodyOf(3).scopes).toEqual(["pastes:write", "spotdl:submit"]);
    });

    it("creates a key with only an app scope, once its box is ticked again", async () => {
      const { wrapper: panel } = await mountLinked(linked("spotdl:submit"), [], SPOTDL);
      const app = panel.find('[role="group"][aria-label="Apps"] input');
      await app.setValue(false);
      await panel.find(".key-form").trigger("submit");
      expect(panel.find(".key-form__error").text()).toBe(Messages.ApiKeys.scopesMissing);
      await app.setValue(true);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(withToken(DEPLOY, CREATED));
      fetchMock.mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);

      expect(bodyOf(2).scopes).toEqual(["spotdl:submit"]);
    });

    it("leaves out the apps whose lookup failed, saying so apart from an unknown one", async () => {
      fetchMock
        .mockResolvedValueOnce(list())
        .mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }))
        .mockRejectedValueOnce(new TypeError("Failed to fetch"))
        .mockResolvedValueOnce(NO_CLIENT);
      ({ wrapper } = await mountWithRouter(
        ApiKeysPanel,
        { attachTo: document.body },
        linked("spotdl:submit,kiwix:search,nobody:x,pastes:read")
      ));
      await flushPromises();

      expect(ticked(wrapper!)).toEqual(["Pastes Read"]);
      expect(wrapper!.find('[role="group"][aria-label="Apps"]').exists()).toBe(false);
      expect(leftOut(wrapper!).text()).toBe(
        `${Messages.ApiKeys.scopesLeftOut(["nobody:x"], 0)} ${Messages.ApiKeys.appsUnchecked(2)}`
      );
      expect(console.error).toHaveBeenCalled();
    });

    it("keeps a form opened by hand while an app is looked up empty", async () => {
      fetchMock.mockResolvedValueOnce(list());
      const pending = deferResponse(fetchMock);
      ({ wrapper } = await mountWithRouter(
        ApiKeysPanel,
        { attachTo: document.body },
        linked("spotdl:submit")
      ));
      await flushPromises();
      await key(wrapper!, "Create an API key").trigger("click");
      pending.respond(SPOTDL);
      await flushPromises();

      expect(ticked(wrapper!)).toEqual([]);
      expect(leftOut(wrapper!).exists()).toBe(false);
    });

    it("offers no app scopes without the link", async () => {
      const panel = await mountPanel();
      await key(panel, "Create an API key").trigger("click");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(panel.find('[role="group"][aria-label="Apps"]').exists()).toBe(false);
    });

    it("never ticks an admin scope, even the superuser's", async () => {
      isSuperuser.value = true;
      const { wrapper: panel } = await mountLinked(linked("admin:read,uploads:read"));

      expect(panel.find('[role="group"][aria-label="Admin"]').exists()).toBe(true);
      expect(ticked(panel)).toEqual(["Uploads Read"]);
      expect(leftOut(panel).text()).toBe(Messages.ApiKeys.scopesLeftOut(["admin:read"], 0));
    });

    it.each(["/account/api-keys", LINK])(
      "keeps a form opened by hand while the list loads, on %s",
      async (path) => {
        const pending = deferResponse(fetchMock);
        ({ wrapper } = await mountWithRouter(ApiKeysPanel, { attachTo: document.body }, path));
        await key(wrapper!, "Create an API key").trigger("click");
        pending.respond(list());
        await flushPromises();

        expect((wrapper!.find(".key-form input").element as HTMLInputElement).value).toBe("");
        expect(ticked(wrapper!)).toEqual([]);
      }
    );

    it("is ignored at the cap, its query kept", async () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({ ...DEPLOY, id: `${i}`.repeat(32) }));
      const { wrapper: panel, router } = await mountLinked(LINK, ten);

      expect(panel.find(".key-form").exists()).toBe(false);
      expect(panel.text()).toContain(Messages.ApiKeys.atCap(10));
      expect(router.currentRoute.value.query).toHaveProperty("newApiKey", "1");
    });

    it("fills in Create once a key deleted at the cap makes room", async () => {
      const ten = Array.from({ length: 10 }, (_, i) => ({ ...DEPLOY, id: `${i}`.repeat(32) }));
      const panel = (await mountLinked(LINK, ten)).wrapper;
      const remove = () => rows(panel)[0].find(".api-key__keys button:last-child");
      await remove().trigger("click");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: "API key deleted successfully." }))
        .mockResolvedValueOnce(list(...ten.slice(1)));
      await remove().trigger("click");
      await flushPromises();
      await key(panel, "Create an API key").trigger("click");

      expect((panel.find(".key-form input").element as HTMLInputElement).value).toBe("Deploy bot");
      expect(ticked(panel)).toEqual(["Pastes Read", "Pastes Write"]);
    });

    it("stays in the address for after a visitor logs in", async () => {
      isLoggedIn.value = false;
      const { wrapper: panel, router } = await mountWithRouter(ApiKeysPanel, {}, LINK);
      wrapper = panel;
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(panel.text()).toContain("Log in to manage your API keys.");
      expect(router.currentRoute.value.fullPath).toBe(LINK);
    });

    it("goes with Cancel, which drops its query, and the next form opens empty", async () => {
      const { wrapper: panel, router } = await mountLinked(linked("spotdl:submit"), [], NO_CLIENT);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      const errorId = panel.find(".key-form__error").attributes("id");
      expect(panel.find(".key-form__scopes").attributes("aria-describedby")).toBe(
        `${leftOut(panel).attributes("id")} ${errorId}`
      );
      await key(panel, "Cancel").trigger("click");
      await flushPromises();

      expect(router.currentRoute.value.query).toEqual({});
      await key(panel, "Create an API key").trigger("click");
      expect((panel.find(".key-form input").element as HTMLInputElement).value).toBe("");
      expect(ticked(panel)).toEqual([]);
      expect(leftOut(panel).exists()).toBe(false);
    });

    it("keeps the app scopes through a GitHub confirmation", async () => {
      hasPassword.value = false;
      const { wrapper: panel, router } = await mountLinked(
        linked("spotdl:submit,pastes:read"),
        [],
        SPOTDL
      );
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, {
          error:
            "Confirm it's you first: log in with GitHub again (or relink it), then create or rotate the API key within 10 minutes."
        })
      );
      await panel.find(".reauth").trigger("submit");
      await flushPromises();
      await panel.find(".reauth a").trigger("click");

      expect(router.resolve(takeGithubReturn()).query).toMatchObject({
        scopes: "pastes:read,spotdl:submit"
      });
    });

    it("comes back from a GitHub confirmation as the user left it", async () => {
      hasPassword.value = false;
      const { wrapper: panel, router } = await mountLinked(LINK);
      await panel.find(".key-form input").setValue("Deploy bot 2");
      await checkbox(panel, "Pastes", "Write").setValue(false);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, {
          error:
            "Confirm it's you first: log in with GitHub again (or relink it), then create or rotate the API key within 10 minutes."
        })
      );
      await panel.find(".reauth").trigger("submit");
      await flushPromises();
      await panel.find(".reauth a").trigger("click");

      expect(router.resolve(takeGithubReturn()).query).toEqual({
        newApiKey: "1",
        name: "Deploy bot 2",
        scopes: "pastes:read",
        tab: "x"
      });
    });

    it("stays through a rotate, which closes the form", async () => {
      const { wrapper: panel, router } = await mountLinked(LINK, [DEPLOY]);
      await key(panel, "Rotate Deploy bot").trigger("click");
      await flushPromises();
      await panel.find(".api-key .key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(withToken(DEPLOY, ROTATED))
        .mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);

      expect(panel.find(".token").text()).toContain(ROTATED);
      expect(panel.find(".key-form").exists()).toBe(false);
      expect(router.currentRoute.value.fullPath).toBe(LINK);
    });
  });

  describe("rotating", () => {
    const openRotate = async (panel: VueWrapper, name = "Deploy bot") => {
      await key(panel, `Rotate ${name}`).trigger("click");
      await flushPromises();
    };

    it("keeps the current lifetime by leaving expiresInDays out", async () => {
      const panel = await mountPanel(DEPLOY);
      await openRotate(panel);
      expect(panel.text()).toContain("It expires 90 days from now again.");
      expect(document.activeElement).toBe(panel.find(".key-form select").element);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      expect(panel.text()).toContain("The current token stops working at once");
      fetchMock
        .mockResolvedValueOnce(withToken(DEPLOY, ROTATED))
        .mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);

      expect(urlOf(1)).toBe(`https://api.test/user/api-keys/${DEPLOY.id}/rotate`);
      expect(methodOf(1)).toBe("POST");
      expect("expiresInDays" in bodyOf(1)).toBe(false);
      expect(bodyOf(1)).toEqual({ password: "secret" });
      expect(panel.find(".token").text()).toContain(ROTATED);
      expect(panel.find(".key-form").exists()).toBe(false);
    });

    it("says a key that never expires still doesn't, and a one-day key in the singular", async () => {
      const day = { ...OLD, name: "Day" };
      const panel = await mountPanel(FOREVER, day);
      await openRotate(panel, "Forever");
      expect(panel.text()).toContain("It still never expires.");
      await key(panel, "Cancel").trigger("click");
      await flushPromises();
      expect(document.activeElement).toBe(key(panel, "Rotate Forever").element);
      await openRotate(panel, "Day");
      expect(panel.text()).toContain("It expires 1 day from now again.");
    });

    it("sends a new number of days, or null", async () => {
      const panel = await mountPanel(DEPLOY);
      await openRotate(panel);
      await panel.find(".key-form select").setValue("days");
      await panel.find('input[inputmode="numeric"]').setValue("30");
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(withToken(DEPLOY, ROTATED))
        .mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);
      expect(bodyOf(1)).toEqual({ password: "secret", expiresInDays: 30 });

      await key(panel, "I've saved it").trigger("click");
      await openRotate(panel);
      await panel.find(".key-form select").setValue("never");
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(withToken(FOREVER, ROTATED))
        .mockResolvedValueOnce(list(FOREVER));
      await confirm(panel);
      expect(bodyOf(3)).toEqual({ password: "secret", expiresInDays: null });
    });

    it("holds the key quietly through the day's used-up mail", async () => {
      const panel = await mountPanel(DEPLOY);
      await openRotate(panel);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(503, { error: BUDGET, retryAfter: 3600, reason: "mailBudget" })
      );
      await confirm(panel);

      expect(panel.find(".reauth").text()).toContain(BUDGET);
      expect(key(panel, "Try again in 1 hr").attributes("disabled")).toBeDefined();
      expect(console.error).not.toHaveBeenCalled();
    });

    it.each([
      [404, GONE],
      [409, CHANGED]
    ])("closes on a %i, says so and reloads the list", async (status, error) => {
      const panel = await mountPanel(DEPLOY);
      await openRotate(panel);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(status, { error }))
        .mockResolvedValueOnce(list());
      await confirm(panel);

      expect(panel.find(".key-form, .reauth").exists()).toBe(false);
      expect(notice(panel).text()).toBe(error);
      expect(notice(panel).classes()).toContain("status--info");
      expect(document.activeElement).toBe(notice(panel).element);
      expect(urlOf(2)).toBe("https://api.test/user/api-keys");
      expect(console.error).not.toHaveBeenCalled();
    });

    it("keeps a refusal in the form, like the admin scopes' 403", async () => {
      const panel = await mountPanel(DEPLOY);
      await openRotate(panel);
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      const refusal = "Only the superuser can give an API key admin scopes.";
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: refusal }));
      await confirm(panel);

      expect(panel.find(".reauth").text()).toContain(refusal);
      expect(panel.find(".reauth a").exists()).toBe(false);
    });
  });

  describe("deleting", () => {
    it("takes two clicks and no password", async () => {
      const panel = await mountPanel(DEPLOY, OLD);
      const remove = () => rows(panel)[0].find(".api-key__keys button:last-child");
      await remove().trigger("click");
      expect(remove().text()).toContain("Confirm delete");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: "API key deleted successfully." }))
        .mockResolvedValueOnce(list(OLD));
      await remove().trigger("click");
      await flushPromises();

      expect(urlOf(1)).toBe(`https://api.test/user/api-keys/${DEPLOY.id}`);
      expect(methodOf(1)).toBe("DELETE");
      expect(fetchMock.mock.calls[1][1]!.body).toBeUndefined();
      expect(notice(panel).text()).toBe("API key deleted successfully.");
      expect(notice(panel).classes()).toContain("status--success");
      expect(rows(panel).map((row) => row.find("h3").text())).toEqual(["Old script"]);
    });

    it("says a key deleted elsewhere is gone", async () => {
      const panel = await mountPanel(DEPLOY);
      const remove = () => rows(panel)[0].find(".api-key__keys button:last-child");
      await remove().trigger("click");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { error: GONE }))
        .mockResolvedValueOnce(list());
      await remove().trigger("click");
      await flushPromises();

      expect(notice(panel).text()).toBe(GONE);
      expect(notice(panel).classes()).toContain("status--info");
      expect(console.error).not.toHaveBeenCalled();
    });

    it("shows a failed delete on the row, and opening a form clears the notice", async () => {
      const panel = await mountPanel(DEPLOY);
      const remove = () => rows(panel)[0].find(".api-key__keys button:last-child");
      await remove().trigger("click");
      fetchMock.mockRejectedValueOnce(new TypeError("offline"));
      await remove().trigger("click");
      await flushPromises();

      expect(rows(panel)[0].find(".api-key__error").text()).toBe(Messages.connectionError);
      await key(panel, "Rotate Deploy bot").trigger("click");
      expect(panel.find(".api-key__error").exists()).toBe(false);
    });
  });

  describe("the token", () => {
    const showToken = async () => {
      const panel = await mountPanel();
      await fillCreate(panel);
      fetchMock
        .mockResolvedValueOnce(withToken(DEPLOY, CREATED))
        .mockResolvedValueOnce(list(DEPLOY));
      await confirm(panel);
      return panel;
    };

    /** Rotates `apiKey` (listed on the page), answering with `token`; the list then holds `after`. */
    const rotate = async (panel: VueWrapper, apiKey: ApiKey, token: string, ...after: ApiKey[]) => {
      await key(panel, `Rotate ${apiKey.name}`).trigger("click");
      await flushPromises();
      await panel.find(".key-form").trigger("submit");
      await flushPromises();
      fetchMock
        .mockResolvedValueOnce(
          jsonResponse(200, { message: ROTATED, apiKey: { ...apiKey, token } })
        )
        .mockResolvedValueOnce(list(...after));
      await confirm(panel);
    };
    const shownTokens = (panel: VueWrapper) =>
      panel.findAll(".token__text").map((text) => text.text());
    const second = `vbk_${"B".repeat(43)}`;
    const third = `vbk_${"C".repeat(43)}`;

    it("replaces a key's token on show when that key is rotated again", async () => {
      const panel = await showToken();
      await rotate(panel, DEPLOY, second, DEPLOY);

      expect(shownTokens(panel)).toEqual([second]);
      expect(panel.find(".token__title").text()).toBe("New token for Deploy bot");
      expect(panel.find(".token").text()).toContain(ROTATED);
      expect(document.activeElement).toBe(panel.find(".token__title").element);
    });

    it("keeps another key's unsaved token, and drops a deleted key's", async () => {
      const panel = await mountPanel(DEPLOY, OLD);
      await rotate(panel, DEPLOY, second, DEPLOY, OLD);
      await rotate(panel, OLD, third, DEPLOY, OLD);

      expect(shownTokens(panel)).toEqual([third, second]);
      const titles = panel.findAll(".token__title");
      expect(document.activeElement).toBe(titles[0].element);
      expect(titles[0].attributes("id")).not.toBe(titles[1].attributes("id"));

      const remove = () => rows(panel)[1].find(".api-key__keys button:last-child");
      await remove().trigger("click");
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { message: "API key deleted successfully." }))
        .mockResolvedValueOnce(list(DEPLOY));
      await remove().trigger("click");
      await flushPromises();
      expect(shownTokens(panel)).toEqual([second]);

      await key(panel, "I've saved it").trigger("click");
      await flushPromises();
      expect(shownTokens(panel)).toEqual([]);
      expect(document.activeElement).toBe(key(panel, "Create an API key").element);
    });

    it("focuses the next token on show once one is saved", async () => {
      const panel = await mountPanel(DEPLOY, OLD);
      await rotate(panel, DEPLOY, second, DEPLOY, OLD);
      await rotate(panel, OLD, third, DEPLOY, OLD);
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();

      expect(shownTokens(panel)).toEqual([second]);
      expect(document.activeElement).toBe(panel.find(".token__title").element);
    });

    it("focuses the password, not the hidden username, of a create at its confirmation", async () => {
      const panel = await showToken();
      await fillCreate(panel);
      expect(panel.find('.reauth input[type="email"]').exists()).toBe(true);
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();

      expect(document.activeElement).toBe(panel.find('.reauth input[type="password"]').element);
    });

    it("focuses the open create form once the last token is saved", async () => {
      const panel = await showToken();
      await rotate(panel, DEPLOY, second, DEPLOY);
      await key(panel, "Create an API key").trigger("click");
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();

      expect(document.activeElement).toBe(panel.find(".key-form input").element);
    });

    it("focuses the cap's line once the tenth key's token is saved", async () => {
      const nine = Array.from({ length: 9 }, (_, i) => ({ ...OLD, id: `${i}`.repeat(32) }));
      const panel = await mountPanel(...nine);
      await fillCreate(panel);
      fetchMock
        .mockResolvedValueOnce(withToken(DEPLOY, CREATED))
        .mockResolvedValueOnce(list(...nine, DEPLOY));
      await confirm(panel);
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();

      expect(document.activeElement?.textContent?.trim()).toBe(Messages.ApiKeys.atCap(10));
    });

    it("copies it", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal("navigator", { clipboard: { writeText } });
      const panel = await showToken();
      await key(panel, "Copy token").trigger("click");
      await flushPromises();

      expect(writeText).toHaveBeenCalledWith(TOKEN);
      expect(panel.find(".token [role=status]").text()).toBe("Token copied.");
    });

    it("says when it couldn't copy", async () => {
      vi.stubGlobal("navigator", {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error()) }
      });
      const panel = await showToken();
      await key(panel, "Copy token").trigger("click");
      await flushPromises();

      expect(panel.find(".token [role=status]").text()).toBe(
        "Couldn't copy: select the token instead."
      );
    });

    it("stays above the gate when the session ends, until it's saved", async () => {
      const panel = await showToken();
      isLoggedIn.value = false;
      sessionEnded.value = true;
      await flushPromises();

      expect(panel.find(".token__text").text()).toBe(TOKEN);
      expect(panel.text()).toContain(Messages.Auth.sessionEnded);
      expect(document.activeElement).toBe(panel.find(".token__title").element);
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();
      expect(panel.find(".token").exists()).toBe(false);
      expect(document.activeElement).toBe(panel.find(".notice").element);
    });

    it("hands the focus to the gate's message once saved after a logout", async () => {
      const panel = await showToken();
      isLoggedIn.value = false;
      await flushPromises();
      await key(panel, "I've saved it").trigger("click");
      await flushPromises();

      expect(document.activeElement?.textContent?.trim()).toBe("Log in to manage your API keys.");
    });

    it("isn't stored anywhere", async () => {
      const panel = await showToken();

      expect(JSON.stringify({ ...sessionStorage })).not.toContain(TOKEN);
      expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
      expect(window.location.href).not.toContain(TOKEN);
      expect(console.error).not.toHaveBeenCalled();
      expect(panel.find(".token__usage").text()).not.toContain(TOKEN);
    });
  });

  it("moves focus to why the board went when the session ends", async () => {
    const panel = await mountPanel(DEPLOY);
    isLoggedIn.value = false;
    sessionEnded.value = true;
    await flushPromises();

    expect(document.activeElement).toBe(panel.find(".notice").element);
    expect(panel.find(".api-key").exists()).toBe(false);
  });
});
