import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import ReauthForm from "@/components/features/account/ReauthForm.vue";
import { hasPassword } from "@/scripts/authentication/authState";
import { DELETE_INTENT_STORAGE_KEY, saveDeleteIntent } from "@/scripts/authentication/deleteIntent";
import type { ApiResult } from "@/scripts/api/client";
import type { MessageResponse } from "@/types/api/common";
import { descriptionOf } from "@/__tests__/helpers/description";

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then change MFA settings within 10 minutes.";
const WRONG = "The provided password is incorrect.";
const TOO_MANY = "Too many failed attempts: try again later.";

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

const mountForm = (send: (body: object) => Promise<ApiResult<MessageResponse>>, danger = false) => {
  wrapper = mount(ReauthForm, {
    props: {
      send,
      submitLabel: "Turn off",
      busyLabel: "Turning off",
      hint: "Confirms it's you.",
      danger
    },
    attachTo: document.body
  });
  return wrapper;
};

describe("ReauthForm", () => {
  beforeEach(() => {
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

  it("sends no password for an account made with GitHub, and offers GitHub when it must confirm", async () => {
    hasPassword.value = false;
    saveDeleteIntent("vb");
    const send = vi.fn().mockResolvedValueOnce(refused(403, REAUTH));
    const form = mountForm(send);
    expect(form.find("input").exists()).toBe(false);
    expect(form.find(".reauth__note").text()).toBe(
      "Confirms it's you. If you logged in more than 10 minutes ago, GitHub confirms it's you first."
    );
    const submit = form.find('button[type="submit"]');
    expect(document.activeElement).toBe(submit.element);
    expect(descriptionOf(submit)).toContain("Confirms it's you.");

    await form.find("form").trigger("submit");
    await flushPromises();

    expect(send).toHaveBeenCalledWith({});
    expect(form.find('[role="status"]').text()).toBe(REAUTH);
    const github = form.find("a");
    expect(github.text()).toBe("Confirm with GitHub");
    expect(github.attributes("href")).toBe("https://api.test/auth/github/link");
    expect(document.activeElement).toBe(github.element);
    // The relink is for this setting, not a delete remembered from before.
    github.element.addEventListener("click", (event) => event.preventDefault());
    await github.trigger("click");
    expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
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
