import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import GithubLink from "@/components/features/account/GithubLink.vue";
import {
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  userEmail
} from "@/scripts/authentication/authState";
import { LEAVING_GRACE_MS } from "@/composables/useGithubLink";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

type Wrapper = Awaited<ReturnType<typeof mountWithRouter>>["wrapper"];

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?state=xyz";

const mountKey = () => mountWithRouter(GithubLink, { attachTo: document.body }, "/account");

const opener = (wrapper: Wrapper) => wrapper.find("button.github__key");
const confirmKey = (wrapper: Wrapper) => wrapper.find('button[type="submit"]');
const cancelKey = (wrapper: Wrapper) =>
  wrapper.findAll("form button").find((button) => button.text() === "Cancel")!;
const passwordInput = (wrapper: Wrapper) =>
  wrapper.find<HTMLInputElement>('input[type="password"]');

const open = async (wrapper: Wrapper) => {
  await opener(wrapper).trigger("click");
  await flushPromises();
};

const confirmWith = async (wrapper: Wrapper, password: string) => {
  await passwordInput(wrapper).setValue(password);
  await wrapper.find("form").trigger("submit");
};

/** A fetch answer the test hands out when it's ready. */
const holdAnswer = (fetchMock: ReturnType<typeof mockFetch>) => {
  let answer!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
  return (response: Response) => answer(response);
};

describe("GithubLink", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.spyOn(console, "error").mockImplementation(() => {});
    isLoggedIn.value = true;
    userEmail.value = "vb@example.com";
    hasPassword.value = true;
  });

  describe("linking with a password", () => {
    it("asks for the password in place before anything is sent", async () => {
      const { wrapper } = await mountKey();
      expect(opener(wrapper).text()).toBe("Link GitHub");
      expect(opener(wrapper).classes()).toContain("btn--primary");
      expect(wrapper.find("a").exists()).toBe(false);

      await open(wrapper);

      expect(wrapper.emitted("start")).toHaveLength(1);
      expect(opener(wrapper).exists()).toBe(false);
      const input = passwordInput(wrapper);
      expect(input.attributes("autocomplete")).toBe("current-password");
      expect(document.activeElement).toBe(input.element);
      expect(wrapper.find("label").text()).toBe("Password");
      expect(wrapper.find(".field__hint").text()).toBe(
        "Confirms it's you. GitHub opens next, to approve the link."
      );
      // The account the password belongs to, for password managers.
      expect(wrapper.find<HTMLInputElement>('input[autocomplete="username"]').element.value).toBe(
        "vb@example.com"
      );
      expect(confirmKey(wrapper).text()).toBe("Continue to GitHub");
      // Like every key that leaves for GitHub, it carries the GitHub mark.
      expect(confirmKey(wrapper).find("svg").exists()).toBe(true);
      expect(confirmKey(wrapper).attributes("aria-disabled")).toBe("true");
      expect(confirmKey(wrapper).classes()).not.toContain("btn--error");
      expect(fetchMock).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it("asks for the password when it's left out", async () => {
      const { wrapper } = await mountKey();
      await open(wrapper);

      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(fetchMock).not.toHaveBeenCalled();
      expect(wrapper.find(".field__error").text()).toBe("Enter your password.");
      wrapper.unmount();
    });

    it("sends the password and stays disabled while GitHub opens", async () => {
      const answer = holdAnswer(fetchMock);
      const { wrapper } = await mountKey();
      await open(wrapper);

      await confirmWith(wrapper, "hunter22");
      expect(confirmKey(wrapper).text()).toBe("Opening GitHub");
      expect(confirmKey(wrapper).attributes("disabled")).toBeDefined();
      expect(cancelKey(wrapper).attributes("disabled")).toBeDefined();
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      expect(wrapper.find("form").exists()).toBe(true);

      answer(jsonResponse(200, { url: AUTHORIZE_URL }));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "hunter22" }),
        signal: expect.any(AbortSignal)
      });
      expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
      // Back may restore the page as it was left, so the password is gone already, quietly.
      expect(passwordInput(wrapper).element.value).toBe("");
      expect(wrapper.find(".field__error").exists()).toBe(false);
      // A second start would replace this one's proof, so nothing can start one meanwhile.
      expect(confirmKey(wrapper).text()).toBe("Opening GitHub");
      expect(confirmKey(wrapper).attributes("disabled")).toBeDefined();
      expect(cancelKey(wrapper).attributes("disabled")).toBeDefined();
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      expect(wrapper.find("form").exists()).toBe(true);
      wrapper.unmount();
    });

    it("lets a navigation that never left be given up on, keeping the key disabled", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }))
        .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
      const { wrapper } = await mountKey();
      await open(wrapper);
      await confirmWith(wrapper, "hunter22");
      await flushPromises();
      expect(cancelKey(wrapper).attributes("disabled")).toBeDefined();

      // Stopped, or blocked by an extension: the page is still here after a while.
      await vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS);
      expect(cancelKey(wrapper).attributes("disabled")).toBeUndefined();
      expect(confirmKey(wrapper).attributes("disabled")).toBeDefined();

      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();
      expect(wrapper.find("form").exists()).toBe(false);
      expect(document.activeElement).toBe(opener(wrapper).element);

      await open(wrapper);
      await confirmWith(wrapper, "hunter22");
      await flushPromises();
      expect(assign).toHaveBeenCalledTimes(2);
      wrapper.unmount();
    });

    it.each([
      [400, { error: "You must provide your password to link or unlink GitHub." }],
      [403, { error: "The provided password is incorrect." }],
      [429, { error: "Too many failed attempts: try again later." }]
    ])("shows the API's %i with the field and keeps the password", async (status, body) => {
      const { wrapper } = await mountKey();
      await open(wrapper);
      fetchMock.mockResolvedValueOnce(jsonResponse(status, body));

      // The clicked key disables while it works, which drops the focus.
      (document.activeElement as HTMLElement).blur();
      await confirmWith(wrapper, "wrong");
      await flushPromises();

      const alert = wrapper.find('[role="alert"]');
      expect(alert.text()).toBe(body.error);
      expect(passwordInput(wrapper).attributes("aria-describedby")).toContain(
        alert.attributes("id")
      );
      expect(passwordInput(wrapper).element.value).toBe("wrong");
      expect(document.activeElement).toBe(passwordInput(wrapper).element);
      expect(confirmKey(wrapper).text()).toBe("Continue to GitHub");
      expect(assign).not.toHaveBeenCalled();
      wrapper.unmount();
    });

    it("leaves the focus where it is when it stayed in the form", async () => {
      const { wrapper } = await mountKey();
      await open(wrapper);
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Wrong." }));

      (cancelKey(wrapper).element as HTMLElement).focus();
      await confirmWith(wrapper, "wrong");
      await flushPromises();

      expect(document.activeElement).toBe(cancelKey(wrapper).element);
      wrapper.unmount();
    });

    it.each([
      ["a rate limiter's 429", jsonResponse(429), "Too many requests: try again later."],
      [
        "an API without GitHub",
        jsonResponse(503, { error: "notConfigured" }),
        "GitHub login isn't available right now."
      ]
    ])("explains %s", async (_what, response, message) => {
      const { wrapper } = await mountKey();
      await open(wrapper);
      fetchMock.mockResolvedValueOnce(response);

      await confirmWith(wrapper, "hunter22");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe(message);
      wrapper.unmount();
    });

    it("says when the server can't be reached", async () => {
      const { wrapper } = await mountKey();
      await open(wrapper);
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await confirmWith(wrapper, "hunter22");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");
      wrapper.unmount();
    });

    it.each([
      ["Cancel", (wrapper: Wrapper) => cancelKey(wrapper).trigger("click")],
      ["Escape", (wrapper: Wrapper) => wrapper.find("form").trigger("keydown", { key: "Escape" })]
    ])("%s closes the form, forgets it and returns focus to the key", async (_how, close) => {
      const { wrapper } = await mountKey();
      await open(wrapper);
      fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Wrong." }));
      await confirmWith(wrapper, "wrong");
      await flushPromises();

      await close(wrapper);
      await flushPromises();

      expect(wrapper.find("form").exists()).toBe(false);
      expect(document.activeElement).toBe(opener(wrapper).element);

      await open(wrapper);
      expect(passwordInput(wrapper).element.value).toBe("");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find(".field__error").exists()).toBe(false);
      wrapper.unmount();
    });
  });

  describe("linking an account made with GitHub", () => {
    beforeEach(() => {
      hasPassword.value = false;
    });

    it("goes to GitHub straight away, without a body", async () => {
      const answer = holdAnswer(fetchMock);
      const { wrapper } = await mountKey();

      await opener(wrapper).trigger("click");
      expect(wrapper.emitted("start")).toHaveLength(1);
      expect(wrapper.find("form").exists()).toBe(false);
      expect(opener(wrapper).text()).toBe("Opening GitHub");
      expect(opener(wrapper).attributes("disabled")).toBeDefined();

      answer(jsonResponse(200, { url: AUTHORIZE_URL }));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
        method: "POST",
        credentials: "include",
        signal: expect.any(AbortSignal)
      });
      expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
      expect(opener(wrapper).attributes("disabled")).toBeDefined();
      wrapper.unmount();
    });

    it("can be pressed again once a navigation never left", async () => {
      vi.useFakeTimers();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }))
        .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
      const { wrapper } = await mountKey();

      await opener(wrapper).trigger("click");
      await flushPromises();
      expect(opener(wrapper).attributes("disabled")).toBeDefined();

      await vi.advanceTimersByTimeAsync(LEAVING_GRACE_MS);
      expect(opener(wrapper).attributes("disabled")).toBeUndefined();
      expect(opener(wrapper).text()).toBe("Link GitHub");

      await opener(wrapper).trigger("click");
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(assign).toHaveBeenCalledTimes(2);
      expect(opener(wrapper).text()).toBe("Opening GitHub");
      wrapper.unmount();
    });

    it("shows why it couldn't start above the key, until it's pressed again", async () => {
      fetchMock
        .mockResolvedValueOnce(jsonResponse(503, { error: "notConfigured" }))
        .mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));
      const { wrapper } = await mountKey();

      await opener(wrapper).trigger("click");
      await flushPromises();
      expect(wrapper.find('[role="alert"]').text()).toBe("GitHub login isn't available right now.");
      expect(opener(wrapper).text()).toBe("Link GitHub");
      // The key disabled while it worked; focus comes back to it.
      expect(document.activeElement).toBe(opener(wrapper).element);

      await opener(wrapper).trigger("click");
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await flushPromises();
      wrapper.unmount();
    });

    it("has no key once GitHub is linked: it's the only way to log in", async () => {
      githubLinked.value = true;
      const { wrapper } = await mountKey();

      expect(wrapper.find("button").exists()).toBe(false);
      wrapper.unmount();
    });
  });

  it.each([
    ["linked elsewhere", false, "Unlink GitHub"],
    ["unlinked elsewhere", true, "Link GitHub"]
  ])("closes an open form once GitHub is %s", async (_what, linked, key) => {
    githubLinked.value = linked;
    const { wrapper } = await mountKey();
    await open(wrapper);
    await passwordInput(wrapper).setValue("hunter22");

    githubLinked.value = !linked;
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(opener(wrapper).text()).toBe(key);
    expect(document.activeElement).toBe(opener(wrapper).element);

    await open(wrapper);
    expect(passwordInput(wrapper).element.value).toBe("");
    wrapper.unmount();
  });

  it("leaves the focus alone when it wasn't in the form", async () => {
    const { wrapper } = await mountKey();
    await open(wrapper);
    (document.activeElement as HTMLElement).blur();

    githubLinked.value = true;
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(document.body);
    wrapper.unmount();
  });

  describe("unlinking", () => {
    beforeEach(() => {
      githubLinked.value = true;
      githubLogin.value = "octocat";
    });

    it("asks for the password, then unlinks and says so", async () => {
      const answer = holdAnswer(fetchMock);
      const { wrapper } = await mountKey();
      expect(opener(wrapper).text()).toBe("Unlink GitHub");
      expect(opener(wrapper).classes()).toContain("btn--secondary");

      await open(wrapper);
      expect(wrapper.emitted("start")).toHaveLength(1);
      expect(document.activeElement).toBe(passwordInput(wrapper).element);
      expect(wrapper.find(".field__hint").text()).toBe(
        "Confirms it's you. Afterwards you log in with your password only."
      );
      expect(confirmKey(wrapper).text()).toBe("Unlink GitHub");
      expect(confirmKey(wrapper).classes()).not.toContain("btn--error");

      await passwordInput(wrapper).setValue("hunter22");
      // Ready, it turns solid red like an armed Delete.
      expect(confirmKey(wrapper).classes()).toContain("btn--error");
      await wrapper.find("form").trigger("submit");
      expect(confirmKey(wrapper).text()).toBe("Unlinking");
      expect(cancelKey(wrapper).attributes("disabled")).toBeDefined();

      answer(jsonResponse(200, { message: "GitHub account unlinked successfully." }));
      await flushPromises();

      expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "hunter22" })
      });
      expect(wrapper.emitted("unlinked")).toHaveLength(1);
      expect(githubLinked.value).toBe(false);
      expect(wrapper.find("form").exists()).toBe(false);
      expect(opener(wrapper).text()).toBe("Link GitHub");
      wrapper.unmount();
    });

    it("keeps GitHub linked when the password is wrong", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { error: "The provided password is incorrect." })
      );
      const { wrapper } = await mountKey();
      await open(wrapper);

      (document.activeElement as HTMLElement).blur();
      await confirmWith(wrapper, "wrong");
      await flushPromises();

      const alert = wrapper.find('[role="alert"]');
      expect(alert.text()).toBe("The provided password is incorrect.");
      expect(passwordInput(wrapper).attributes("aria-describedby")).toContain(
        alert.attributes("id")
      );
      expect(document.activeElement).toBe(passwordInput(wrapper).element);
      expect(wrapper.emitted("unlinked")).toBeUndefined();
      expect(githubLinked.value).toBe(true);
      wrapper.unmount();
    });

    it("says to wait when a rate limiter answers without a message", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(429));
      const { wrapper } = await mountKey();
      await open(wrapper);

      await confirmWith(wrapper, "hunter22");
      await flushPromises();

      expect(wrapper.find('[role="alert"]').text()).toBe("Too many requests: try again later.");
      wrapper.unmount();
    });

    it("stays open on Escape while the unlink is on its way", async () => {
      const answer = holdAnswer(fetchMock);
      const { wrapper } = await mountKey();
      await open(wrapper);

      await confirmWith(wrapper, "hunter22");
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      expect(wrapper.find("form").exists()).toBe(true);

      answer(jsonResponse(500, { error: "Something broke." }));
      await flushPromises();
      await wrapper.find("form").trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(wrapper.find("form").exists()).toBe(false);
      expect(document.activeElement).toBe(opener(wrapper).element);
      wrapper.unmount();
    });
  });
});
