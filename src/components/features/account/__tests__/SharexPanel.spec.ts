import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, type VueWrapper } from "@vue/test-utils";
import SharexPanel from "@/components/features/account/SharexPanel.vue";
import { Messages } from "@/constants/messages";
import {
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  sessionEnded,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { takeGithubReturn } from "@/scripts/authentication/githubReturn";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const TOKEN = `vbk_${"A".repeat(39)}Zz9_`;
const CREATED = "API key created: store the token somewhere safe, it isn't shown again.";
const CAP = "An account can have at most 10 API keys: delete one first.";
const NAMES = ["vb2007-upload.sxcu", "vb2007-paste.sxcu", "vb2007-shorten.sxcu"];
const uploader = (name: string) => ({
  Version: "17.0.0",
  Name: name,
  RequestMethod: "POST",
  Headers: { Authorization: "Bearer vbk_YOUR_TOKEN" }
});
const FILES = [
  uploader("vb2007.hu upload"),
  uploader("vb2007.hu paste"),
  uploader("vb2007.hu shortener")
];

let fetchMock: ReturnType<typeof mockFetch>;
let wrapper: VueWrapper | undefined;
let made: Blob[];
let clicked: string[];

/** jsdom's Blob has no `text()`. */
const readText = (blob: Blob) =>
  new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsText(blob);
  });

const mountPanel = async (path = "/account/sharex") => {
  ({ wrapper } = await mountWithRouter(SharexPanel, { attachTo: document.body }, path));
  await flushPromises();
  return wrapper!;
};

const key = (panel: VueWrapper, text: string) =>
  panel
    .findAll("button")
    .find((button) => (button.attributes("aria-label") ?? button.text()).trim() === text)!;
const urlOf = (call: number) => fetchMock.mock.calls[call][0];
const initOf = (call: number) => fetchMock.mock.calls[call][1]!;

const queueFiles = (...files: unknown[]) =>
  files.forEach((file) => fetchMock.mockResolvedValueOnce(jsonResponse(200, file)));

/** Opens the confirmation and sends it, with the password when the account has one. */
const confirm = async (panel: VueWrapper) => {
  await key(panel, "Set up ShareX").trigger("click");
  if (hasPassword.value) await panel.find('.reauth input[type="password"]').setValue("secret");
  await panel.find(".reauth").trigger("submit");
  await flushPromises();
};

const setUp = async () => {
  const panel = await mountPanel();
  queueFiles(...FILES);
  fetchMock.mockResolvedValueOnce(
    jsonResponse(201, { message: CREATED, apiKey: { id: "k1", name: "ShareX", token: TOKEN } })
  );
  await confirm(panel);
  return panel;
};

describe("SharexPanel", () => {
  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    made = [];
    clicked = [];
    let count = 0;
    URL.createObjectURL = vi.fn((blob: Blob) => {
      made.push(blob);
      return `blob:sharex-${++count}`;
    });
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push(this.getAttribute("download")!);
    });
    isSessionChecked.value = true;
    isLoggedIn.value = true;
    sessionEnded.value = false;
    username.value = "vb";
    userEmail.value = "vb@example.com";
    hasPassword.value = true;
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    isLoggedIn.value = false;
    sessionEnded.value = false;
  });

  it("shows the steps without asking the API for anything", async () => {
    const panel = await mountPanel();

    expect(panel.find("h1").text()).toBe("ShareX");
    expect(panel.find('a[href="/account"]').text()).toBe("Your account");
    expect(panel.findAll(".slots__row").map((row) => row.text())).toEqual([
      "Image uploadervb2007.hu upload",
      "File uploadervb2007.hu upload",
      "Text uploadervb2007.hu paste",
      "URL shortenervb2007.hu shortener"
    ]);
    expect(panel.text()).toContain("Unsupported request format JSON");
    expect(panel.text()).toContain(Messages.Sharex.keyLifetime(90));
    expect(panel.find(".intro").text()).toContain(
      "Screenshots, files and text sent with ShareX are public, and anyone can find them without their link. Don't send anything private with it."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("asks a visitor to log in, once the session is known", async () => {
    isLoggedIn.value = false;
    isSessionChecked.value = false;
    const panel = await mountPanel();
    expect(panel.find("h1").exists()).toBe(false);

    isSessionChecked.value = true;
    await flushPromises();
    expect(panel.text()).toContain("Log in to set up ShareX.");
    expect(panel.find('a[href="/login"]').exists()).toBe(true);
    expect(panel.find('a[href="/register"]').exists()).toBe(true);
    expect(panel.find(".steps").exists()).toBe(false);
  });

  it("loads the files, creates the key, then downloads the files with its token", async () => {
    const panel = await setUp();

    expect(fetchMock.mock.calls.map((_, call) => urlOf(call))).toEqual([
      "https://api.test/sharex/upload.sxcu",
      "https://api.test/sharex/paste.sxcu",
      "https://api.test/sharex/shorten.sxcu",
      "https://api.test/user/api-keys"
    ]);
    // The files are public: no session cookie goes to them, nor the token.
    [0, 1, 2].forEach((call) => expect(initOf(call).credentials).toBeUndefined());
    expect(JSON.parse(initOf(3).body as string)).toEqual({
      password: "secret",
      name: "ShareX",
      scopes: ["uploads:write", "pastes:write", "shortUrls:write"]
    });

    const texts = await Promise.all(made.map(readText));
    expect(made.map((blob) => blob.type)).toEqual(Array(3).fill("application/octet-stream"));
    texts.forEach((text, i) => {
      expect(JSON.parse(text)).toEqual({
        ...FILES[i],
        Headers: { Authorization: `Bearer ${TOKEN}` }
      });
      expect(text).not.toContain("vbk_YOUR_TOKEN");
    });
    expect(clicked).toEqual(NAMES);

    const links = panel.findAll('ul[aria-label="Your ShareX files"] a');
    expect(links.map((link) => [link.attributes("href"), link.attributes("download")])).toEqual(
      NAMES.map((name, i) => [`blob:sharex-${i + 1}`, name])
    );
    expect(panel.find(".token__text").text()).toBe(TOKEN);
    expect(panel.find(".token").text()).toContain(`ShareX: ${CREATED}`);
    expect(panel.find(".token__usage").exists()).toBe(false);
    expect(document.activeElement).toBe(panel.find(".token__title").element);
    expect(panel.find(".reauth").exists()).toBe(false);
    // One token at a time: another key would replace this one before it's saved.
    expect(key(panel, "Set up ShareX")).toBeUndefined();
    expect(panel.find(".intro").exists()).toBe(false);
    expect(console.error).not.toHaveBeenCalled();
    expect(window.location.href).not.toContain(TOKEN);
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TOKEN);

    await key(panel, "I've saved the files").trigger("click");
    await flushPromises();
    expect(panel.find(".token").exists()).toBe(false);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(3);
    expect(document.activeElement).toBe(key(panel, "Set up ShareX").element);
  });

  it("frees the files' links when the page goes", async () => {
    await setUp();
    wrapper!.unmount();
    wrapper = undefined;

    expect(vi.mocked(URL.revokeObjectURL).mock.calls).toEqual([
      ["blob:sharex-1"],
      ["blob:sharex-2"],
      ["blob:sharex-3"]
    ]);
  });

  it("creates no key when a file fails to load", async () => {
    const panel = await mountPanel();
    queueFiles(FILES[0]);
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    queueFiles(FILES[2]);
    await confirm(panel);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(panel.find(".reauth .status--error").text().trim()).toBe(
      Messages.Sharex.filesUnavailable
    );
    expect(made).toEqual([]);
  });

  it("creates no key when a file can't be reached", async () => {
    const panel = await mountPanel();
    queueFiles(FILES[0], FILES[1]);
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await confirm(panel);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(panel.find(".reauth .status--error").text().trim()).toBe(
      Messages.Sharex.filesUnavailable
    );
    expect(made).toEqual([]);
  });

  it.each([
    ["an empty bearer", { ...FILES[2], Headers: { Authorization: "Bearer " } }],
    ["no headers", { Name: "vb2007.hu shortener" }],
    ["a different token", { ...FILES[2], Headers: { Authorization: `Bearer ${TOKEN}` } }]
  ])("creates no key when a file has no place for the token: %s", async (_case, bad) => {
    const panel = await mountPanel();
    queueFiles(FILES[0], FILES[1], bad);
    await confirm(panel);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(panel.find(".reauth").text()).toContain(Messages.Sharex.placeholderMissing);
    expect(made).toEqual([]);
    expect(clicked).toEqual([]);
  });

  it("holds the key, creating none, when a file's answer is a 429", async () => {
    const panel = await mountPanel();
    queueFiles(FILES[0]);
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { retryAfter: 60 }));
    queueFiles(FILES[2]);
    await confirm(panel);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(panel.find(".reauth .status--error").text()).toContain(Messages.Sharex.filesUnavailable);
    expect(key(panel, "Try again in 60 seconds").attributes("disabled")).toBeDefined();
  });

  it("creates no key once the page went while the files loaded", async () => {
    const panel = await mountPanel();
    const loads = FILES.map(() => deferResponse(fetchMock));
    await key(panel, "Set up ShareX").trigger("click");
    await panel.find('.reauth input[type="password"]').setValue("secret");
    await panel.find(".reauth").trigger("submit");
    await flushPromises();
    panel.unmount();
    wrapper = undefined;

    loads.forEach((load, i) => load.respond(jsonResponse(200, FILES[i])));
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("makes no files for a key answered after the page went", async () => {
    const panel = await mountPanel();
    queueFiles(...FILES);
    const create = deferResponse(fetchMock);
    await key(panel, "Set up ShareX").trigger("click");
    await panel.find('.reauth input[type="password"]').setValue("secret");
    await panel.find(".reauth").trigger("submit");
    await flushPromises();
    panel.unmount();
    wrapper = undefined;

    create.respond(
      jsonResponse(201, { message: CREATED, apiKey: { id: "k1", name: "ShareX", token: TOKEN } })
    );
    await flushPromises();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(clicked).toEqual([]);
  });

  it("puts the cap in place of the form at 10 keys, with the way to delete one", async () => {
    const panel = await mountPanel();
    queueFiles(...FILES);
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { error: CAP }));
    await confirm(panel);

    expect(panel.find(".reauth").exists()).toBe(false);
    const cap = panel.find(".cap");
    expect(cap.text()).toContain(Messages.ApiKeys.atCap(10));
    expect(cap.find("a").attributes("href")).toBe("/account/api-keys");
    expect(document.activeElement).toBe(cap.find("p").element);
    expect(console.error).not.toHaveBeenCalled();
    expect(made).toEqual([]);
  });

  it("holds the key through the security notices' 429", async () => {
    const panel = await mountPanel();
    queueFiles(...FILES);
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many security notices…", retryAfter: 3600 })
    );
    await confirm(panel);

    expect(panel.find(".reauth").text()).toContain("Too many security notices…");
    expect(key(panel, "Try again in 1 hr").attributes("disabled")).toBeDefined();
  });

  it("cancels back to the key that opened it", async () => {
    const panel = await mountPanel();
    await key(panel, "Set up ShareX").trigger("click");
    await key(panel, "Cancel").trigger("click");
    await flushPromises();

    expect(panel.find(".reauth").exists()).toBe(false);
    expect(document.activeElement).toBe(key(panel, "Set up ShareX").element);
  });

  describe("an account without a password", () => {
    beforeEach(() => {
      hasPassword.value = false;
    });

    it("confirms with GitHub, coming back to this page", async () => {
      const panel = await mountPanel();
      queueFiles(...FILES);
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, {
          error:
            "Confirm it's you first: log in with GitHub again (or relink it), then create or rotate the API key within 10 minutes."
        })
      );
      await confirm(panel);

      expect(JSON.parse(initOf(3).body as string)).not.toHaveProperty("password");
      await panel.find(".reauth a").trigger("click");
      expect(takeGithubReturn()).toBe("/account/sharex");
    });

    it("says GitHub confirmed it, back from the relink", async () => {
      const panel = await mountPanel("/account/sharex?github=linked");

      expect(panel.find(".status--info").text()).toBe(Messages.Sharex.githubConfirmed(10));
      await key(panel, "Set up ShareX").trigger("click");
      expect(panel.find(".status--info").exists()).toBe(false);
    });

    it("explains a relink GitHub refused, and clears it once a key is made", async () => {
      const panel = await mountPanel("/account/sharex?oauthError=accessDenied");
      expect(panel.find(".status--error").text()).toContain("GitHub login was cancelled");

      queueFiles(...FILES);
      fetchMock.mockResolvedValueOnce(
        jsonResponse(201, { message: CREATED, apiKey: { id: "k1", name: "ShareX", token: TOKEN } })
      );
      await confirm(panel);
      expect(panel.find(".status--error").exists()).toBe(false);
    });
  });

  describe("when the session ends", () => {
    it("moves focus to why the page went", async () => {
      const panel = await mountPanel();
      await key(panel, "Set up ShareX").trigger("click");
      isLoggedIn.value = false;
      sessionEnded.value = true;
      await flushPromises();

      expect(panel.text()).toContain(Messages.Auth.sessionEnded);
      expect(document.activeElement?.textContent?.trim()).toBe(Messages.Auth.sessionEnded);

      isLoggedIn.value = true;
      await flushPromises();
      expect(panel.find(".reauth").exists()).toBe(false);
    });

    it("still shows a token whose key was made as the session ended", async () => {
      const panel = await mountPanel();
      queueFiles(...FILES);
      const create = deferResponse(fetchMock);
      await key(panel, "Set up ShareX").trigger("click");
      await panel.find('.reauth input[type="password"]').setValue("secret");
      await panel.find(".reauth").trigger("submit");
      await flushPromises();
      isLoggedIn.value = false;
      sessionEnded.value = true;
      await flushPromises();
      expect(panel.find(".reauth").exists()).toBe(false);
      expect(panel.text()).toContain(Messages.Auth.sessionEnded);

      create.respond(
        jsonResponse(201, { message: CREATED, apiKey: { id: "k1", name: "ShareX", token: TOKEN } })
      );
      await flushPromises();
      expect(panel.find(".token__text").text()).toBe(TOKEN);
      expect(document.activeElement).toBe(panel.find(".token__title").element);
      expect(made).toHaveLength(3);
      expect(clicked).toEqual(NAMES);
    });

    it("keeps a token on show above the gate until it's saved", async () => {
      const panel = await setUp();
      isLoggedIn.value = false;
      await flushPromises();

      expect(panel.find(".token__text").text()).toBe(TOKEN);
      expect(document.activeElement).toBe(panel.find(".token__title").element);
      sessionEnded.value = true;
      await flushPromises();
      expect(document.activeElement).toBe(panel.find(".token__title").element);
      sessionEnded.value = false;
      await flushPromises();
      await key(panel, "I've saved the files").trigger("click");
      await flushPromises();
      expect(document.activeElement?.textContent?.trim()).toBe("Log in to set up ShareX.");
    });
  });
});
