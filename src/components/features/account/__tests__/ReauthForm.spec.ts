import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import { hasPassword } from "@/scripts/authentication/authState";
import { DELETE_INTENT_STORAGE_KEY, saveDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { saveGithubReturn, takeGithubReturn } from "@/scripts/authentication/githubReturn";
import type { ApiResult } from "@/scripts/api/client";
import type { MessageResponse } from "@/types/api/common";
import { descriptionOf } from "@/__tests__/helpers/description";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then change MFA settings within 10 minutes.";
const WRONG = "The provided password is incorrect.";
const TOO_MANY = "Too many failed attempts: try again later.";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize?state=xyz";

const ok = (message: string): ApiResult<MessageResponse> => ({
  ok: true,
  status: 200,
  data: { message }
});
const refused = (
  status: number,
  error: string,
  retryAfter?: number
): ApiResult<MessageResponse> => ({
  ok: false,
  kind: "http",
  status,
  error,
  body: { error, retryAfter }
});

let wrapper: VueWrapper | undefined;

const mountForm = (
  send: (body: object) => Promise<ApiResult<MessageResponse>>,
  danger = false,
  githubReturn?: string
) => {
  wrapper = mount(ReauthForm, {
    props: {
      send,
      submitLabel: "Turn off",
      busyLabel: "Turning off",
      hint: "Confirms it's you.",
      danger,
      githubReturn
    },
    attachTo: document.body
  });
  return wrapper;
};

describe("ReauthForm", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  let assign: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = mockFetch();
    assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });
    vi.spyOn(console, "error").mockImplementation(() => {});
    hasPassword.value = true;
    sessionStorage.clear();
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it("sends the password typed and hands on the answer", async () => {
    const send = vi.fn().mockResolvedValueOnce(ok("Done."));
    const form = mountForm(send);
    const field = form.find('input[type="password"]');
    expect(document.activeElement).toBe(field.element);

    await field.setValue("hunter22");
    await form.find("form").trigger("submit");
    await flushPromises();
    expect(send).toHaveBeenCalledOnce();
    await flushPromises();

    expect(send).toHaveBeenCalledWith({ password: "hunter22" });
    expect(form.emitted("done")).toEqual([[{ message: "Done." }]]);
    expect((field.element as HTMLInputElement).value).toBe("");
  });

  it("asks for the password without sending anything", async () => {
    const send = vi.fn();
    const form = mountForm(send);
    const field = form.find('input[type="password"]');
    await field.setValue("x");
    await field.setValue("");
    await field.trigger("blur");
    expect(form.find(".field__error").text()).toBe("Enter your password.");

    await form.find("form").trigger("submit");
    await flushPromises();

    expect(send).not.toHaveBeenCalled();
  });

  it("shows a refusal under the field, which keeps the cursor, and arms a red key", async () => {
    const send = vi.fn().mockResolvedValueOnce(refused(403, WRONG));
    const form = mountForm(send, true);
    const field = form.find('input[type="password"]');
    await field.setValue("nope");
    expect(form.find('button[type="submit"]').classes()).toContain("btn--error");

    await form.find("form").trigger("submit");
    await flushPromises();

    expect(form.find('[role="alert"]').text()).toBe(WRONG);
    expect(descriptionOf(field)).toContain(WRONG);
    expect(document.activeElement).toBe(field.element);
  });

  it("holds the key after too many wrong passwords", async () => {
    const send = vi.fn().mockResolvedValueOnce(refused(429, TOO_MANY, 900));
    const form = mountForm(send, true);
    await form.find('input[type="password"]').setValue("nope");

    await form.find("form").trigger("submit");
    await flushPromises();

    const key = form.find('button[type="submit"]');
    expect(key.text()).toBe("Try again in 15 min");
    expect(key.attributes("disabled")).toBeDefined();
    expect(key.classes()).not.toContain("btn--error");
    await form.find("form").trigger("submit");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("holds the key through the day's used-up mail, but not through another 503", async () => {
    const budget = {
      ...refused(503, "No more e-mails can be sent today.", 3600),
      body: { error: "No more e-mails can be sent today.", retryAfter: 3600, reason: "mailBudget" }
    };
    const send = vi
      .fn()
      .mockResolvedValueOnce(refused(503, "Down for a moment."))
      .mockResolvedValueOnce(budget);
    const form = mountForm(send);
    await form.find('input[type="password"]').setValue("secret");

    await form.find("form").trigger("submit");
    await flushPromises();
    expect(form.find('button[type="submit"]').text()).toBe("Turn off");

    await form.find("form").trigger("submit");
    await flushPromises();
    const key = form.find('button[type="submit"]');
    expect(key.text()).toBe("Try again in 1 hr");
    expect(key.attributes("disabled")).toBeDefined();
    expect(form.find('[role="alert"]').text()).toContain("No more e-mails can be sent today.");
    expect((form.find('input[type="password"]').element as HTMLInputElement).value).toBe("secret");
  });

  it("sends no password for an account made with GitHub, and offers GitHub when it must confirm", async () => {
    hasPassword.value = false;
    saveDeleteIntent("vb");
    saveGithubReturn("/account/api-keys");
    const send = vi.fn().mockResolvedValueOnce(refused(403, REAUTH));
    const form = mountForm(send);
    expect(form.find("input").exists()).toBe(false);
    expect(form.find(".reauth__note").text()).toBe(
      "Confirms it's you. Unless you logged in with GitHub or relinked it in the last 10 minutes, GitHub confirms it's you first."
    );
    const submit = form.find('button[type="submit"]');
    expect(document.activeElement).toBe(submit.element);
    expect(descriptionOf(submit)).toContain("Confirms it's you.");

    await form.find("form").trigger("submit");
    await flushPromises();

    expect(send).toHaveBeenCalledWith({});
    expect(form.find('[role="status"]').text()).toBe(REAUTH);
    const github = form.find("button");
    expect(github.text()).toBe("Confirm with GitHub");
    expect(document.activeElement).toBe(github.element);
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));

    await github.trigger("click");
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "POST",
      credentials: "include",
      signal: expect.any(AbortSignal)
    });
    expect(github.text()).toBe("Opening GitHub");
    expect(github.attributes("aria-busy")).toBe("true");
    // Cancel waits too: the browser is about to leave for GitHub.
    await form.find("form").trigger("keydown", { key: "Escape" });
    expect(form.emitted("cancel")).toBeUndefined();
    // Nothing is forgotten before it's sure to leave.
    expect(sessionStorage.length).toBe(2);
    answer(jsonResponse(200, { url: AUTHORIZE_URL }));
    await flushPromises();

    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
    // The relink is for this setting, not a delete remembered from before.
    expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
    // Nor a return to another page: this form has none, so the relink comes back here.
    expect(takeGithubReturn()).toBe("");
  });

  it("keeps where to come back to from GitHub, once the relink starts", async () => {
    hasPassword.value = false;
    const send = vi.fn().mockResolvedValueOnce(refused(403, REAUTH));
    const form = mountForm(send, false, "/account/api-keys?scopes=pastes%3Aread");
    await form.find("form").trigger("submit");
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { url: AUTHORIZE_URL }));

    await form.find("button").trigger("click");
    await flushPromises();

    expect(assign).toHaveBeenCalledWith(AUTHORIZE_URL);
    expect(takeGithubReturn()).toBe("/account/api-keys?scopes=pastes%3Aread");
  });

  it("says why GitHub couldn't open, leaving the way back as it was", async () => {
    hasPassword.value = false;
    saveGithubReturn("/account/api-keys");
    const send = vi.fn().mockResolvedValueOnce(refused(403, REAUTH));
    const form = mountForm(send, false, "/account/sharex");
    await form.find("form").trigger("submit");
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: "notConfigured" }));

    await form.find("button").trigger("click");
    await flushPromises();

    expect(assign).not.toHaveBeenCalled();
    expect(form.find('[role="status"]').text()).toBe(REAUTH);
    expect(form.find('[role="alert"]').text()).toBe("GitHub login isn't available right now.");
    expect(descriptionOf(form.find("button"))).toBe(
      `${REAUTH} GitHub login isn't available right now.`
    );
    expect(document.activeElement).toBe(form.find("button").element);
    expect(takeGithubReturn()).toBe("/account/api-keys");
  });

  it("holds the GitHub key after the API's 429, with the focus on Cancel", async () => {
    hasPassword.value = false;
    const send = vi.fn().mockResolvedValueOnce(refused(403, REAUTH));
    const form = mountForm(send);
    await form.find("form").trigger("submit");
    await flushPromises();
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error: TOO_MANY, retryAfter: 900 }));

    await form.find("button").trigger("click");
    await flushPromises();

    const github = form.find("button");
    expect(form.find('[role="alert"]').text()).toBe(`${TOO_MANY} Try again in 15 minutes.`);
    expect(github.text()).toBe("Try again in 15 min");
    expect(github.attributes("disabled")).toBeDefined();
    expect(document.activeElement).toBe(form.findAll("button").at(-1)!.element);
  });

  it("puts the cursor back on the key after a GitHub-only refusal that isn't GitHub's", async () => {
    hasPassword.value = false;
    const send = vi.fn().mockResolvedValueOnce(refused(409, "Confirm the address first."));
    const form = mountForm(send);
    (document.activeElement as HTMLElement).blur();

    await form.find("form").trigger("submit");
    await flushPromises();

    expect(form.find('[role="alert"]').text()).toBe("Confirm the address first.");
    expect(document.activeElement).toBe(form.find('button[type="submit"]').element);
  });

  it("cancels with Cancel or Escape, but not while it sends", async () => {
    let answer!: (result: ApiResult<MessageResponse>) => void;
    const send = vi.fn(
      () => new Promise<ApiResult<MessageResponse>>((resolve) => (answer = resolve))
    );
    const form = mountForm(send);

    await form.find("form").trigger("keydown", { key: "Escape" });
    expect(form.emitted("cancel")).toHaveLength(1);

    await form.find('input[type="password"]').setValue("hunter22");
    await form.find("form").trigger("submit");
    await form.find("form").trigger("keydown", { key: "Escape" });
    expect(form.emitted("cancel")).toHaveLength(1);
    answer(ok("Done."));
    await flushPromises();

    await form.findAll("button").at(-1)!.trigger("click");
    expect(form.emitted("cancel")).toHaveLength(2);
  });
});
