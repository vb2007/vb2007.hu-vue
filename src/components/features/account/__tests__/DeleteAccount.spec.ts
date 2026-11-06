import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import DeleteAccount from "@/components/features/account/DeleteAccount.vue";
import {
  hasPassword,
  isLoggedIn,
  sessionEnded,
  username
} from "@/scripts/authentication/authState";
import { saveDeleteIntent, takeDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

type Wrapper = Awaited<ReturnType<typeof mountWithRouter>>["wrapper"];

const mountPanel = (props: { reopen?: boolean } = {}) =>
  mountWithRouter(DeleteAccount, { attachTo: document.body, props }, "/account");

const REAUTH =
  "Confirm it's you first: log in with GitHub again (or relink it), then delete the account within 10 minutes.";

const githubKey = (wrapper: Wrapper) => wrapper.find('a[href="https://api.test/auth/github/link"]');

const deleteKey = (wrapper: Wrapper) => wrapper.find('button[type="submit"]');

const open = async (wrapper: Wrapper) => {
  await wrapper.find("button").trigger("click");
  await flushPromises();
};

describe("DeleteAccount", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
    isLoggedIn.value = true;
    username.value = "me";
    hasPassword.value = true;
    sessionStorage.clear();
  });

  it("says what goes with the account and asks before deleting it", async () => {
    const { wrapper } = await mountPanel();

    expect(wrapper.find("h2").text()).toBe("Delete account");
    expect(wrapper.find(".delete__note").text()).toBe(
      "Deleting your account also deletes your pastes, short links and uploads. It can't be undone."
    );
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find("button").text()).toBe("Delete account");
    wrapper.unmount();
  });

  it("deletes an account with its password and goes home", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper, router } = await mountPanel();
    let loggedInOnArrival: boolean | undefined;
    router.afterEach(() => (loggedInOnArrival = isLoggedIn.value));

    await open(wrapper);
    const input = wrapper.find("input");
    expect(input.attributes("type")).toBe("password");
    expect(input.attributes("autocomplete")).toBe("current-password");
    expect(document.activeElement).toBe(input.element);
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBe("true");
    expect(deleteKey(wrapper).classes()).not.toContain("btn--error");

    await input.setValue("hunter22");
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBeUndefined();
    expect(deleteKey(wrapper).classes()).toContain("btn--error");

    await wrapper.find("form").trigger("submit");
    expect(deleteKey(wrapper).text()).toBe("Deleting");
    answer(jsonResponse(200, { message: "User deleted successfully." }));
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      password: "hunter22"
    });
    expect(router.currentRoute.value.fullPath).toBe("/");
    expect(loggedInOnArrival).toBe(true);
    expect(isLoggedIn.value).toBe(false);
    wrapper.unmount();
  });

  it("stays open on Escape while the delete is on its way", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(true);

    answer(jsonResponse(403, { error: "The provided password is incorrect." }));
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(wrapper.find("input").element.value).toBe("wrong");
    wrapper.unmount();
  });

  it("asks an account made with GitHub to type its username", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    const input = wrapper.find("input");
    expect(wrapper.find("label").text()).toBe("Username");
    expect(wrapper.find(".field__hint").text()).toBe("Type “me” to confirm.");
    expect(input.attributes("autocapitalize")).toBe("off");
    // The field's wrapper takes it, and the input inherits it.
    expect(wrapper.find(".field").attributes("spellcheck")).toBe("false");

    await input.setValue("Me");
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBe("true");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(wrapper.find(".field__error").text()).toBe("That doesn't match “me”.");

    await input.setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ username: "me" });
    wrapper.unmount();
  });

  it("asks for the password once its field is left empty", async () => {
    const { wrapper } = await mountPanel();
    await open(wrapper);
    const input = wrapper.find("input");

    await input.setValue("x");
    await input.setValue("");
    await input.trigger("blur");

    expect(wrapper.find(".field__error").text()).toBe("Enter your password.");
    wrapper.unmount();
  });

  it("says a typed username doesn't match once its field is left", async () => {
    hasPassword.value = false;
    const { wrapper } = await mountPanel();
    await open(wrapper);

    await wrapper.find("input").setValue("you");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.find(".field__error").text()).toBe("That doesn't match “me”.");
    wrapper.unmount();
  });

  it("forgets the typed username and its refusal once the account sets a password", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe("Something went wrong.");
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBeUndefined();
    fetchMock.mockClear();

    hasPassword.value = true;
    await flushPromises();

    expect(wrapper.find("label").text()).toBe("Password");
    expect(wrapper.find("input").element.value).toBe("");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBe("true");
    expect(deleteKey(wrapper).classes()).not.toContain("btn--error");
    await wrapper.find("form").trigger("submit");
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("shows why the API refused and keeps the account", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    const { wrapper, router } = await mountPanel();

    await open(wrapper);
    expect(wrapper.find("input").attributes("aria-describedby")).toBeUndefined();
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const alert = wrapper.find('[role="alert"]');
    expect(alert.text()).toBe("The provided password is incorrect.");
    expect(alert.attributes("id")).toBeTruthy();
    expect(wrapper.find("input").attributes("aria-describedby")).toBe(alert.attributes("id"));
    expect(isLoggedIn.value).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe("/account");
    wrapper.unmount();
  });

  it("brings focus back to the field when a refusal finds it outside, so Escape still closes", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    const input = wrapper.find("input");
    await input.setValue("wrong");
    await wrapper.find("form").trigger("submit");
    (input.element as HTMLInputElement).blur();
    expect(document.activeElement).toBe(document.body);
    answer(jsonResponse(403, { error: "The provided password is incorrect." }));
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The provided password is incorrect.");
    expect(document.activeElement).toBe(input.element);

    await input.trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
    wrapper.unmount();
  });

  it("ties a refused username to the field along with its hint", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(429, { error: "Too many failed attempts: try again later.", retryAfter: 900 })
    );
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const hintId = wrapper.find(".field__hint").attributes("id");
    const alertId = wrapper.find('[role="alert"]').attributes("id");
    expect(wrapper.find("input").attributes("aria-describedby")).toBe(`${alertId} ${hintId}`);
    wrapper.unmount();
  });

  it("holds the delete key for the password checks' wait, no longer armed, then lets it go", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const error = "Too many failed attempts: try again later.";
    fetchMock.mockResolvedValueOnce(jsonResponse(429, { error, retryAfter: 900 }));
    const { wrapper } = await mountPanel();
    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    (deleteKey(wrapper).element as HTMLElement).focus();

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(`${error} Try again in 15 minutes.`);
    // "Delete account in 15 min" would read as a scheduled delete.
    expect(deleteKey(wrapper).text()).toBe("Try again in 15 min");
    expect(deleteKey(wrapper).attributes("aria-label")).toBe("Try again in 15 minutes");
    expect(deleteKey(wrapper).attributes("disabled")).toBeDefined();
    expect(deleteKey(wrapper).classes()).not.toContain("btn--error");
    expect(document.activeElement).toBe(wrapper.find("input").element);

    await wrapper.find("form").trigger("submit");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(deleteKey(wrapper).attributes("aria-describedby")).toBe(
      wrapper.find('[role="alert"]').attributes("id")
    );

    // Cancel forgets the refusal; opened again, the held key still says why.
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    await open(wrapper);
    expect(wrapper.find('[role="alert"]').text()).toBe(`${error} Try again in 15 minutes.`);
    expect(wrapper.find("input").attributes("aria-describedby")).toContain(
      wrapper.find('[role="alert"]').attributes("id")
    );
    await wrapper.find("input").setValue("another try");

    vi.advanceTimersByTime(900_000);
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(deleteKey(wrapper).text()).toBe("Delete account");
    expect(deleteKey(wrapper).classes()).toContain("btn--error");
    wrapper.unmount();
  });

  it("lets a refusal arrive after the panel is gone", async () => {
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    wrapper.unmount();
    answer(jsonResponse(403, { error: "The provided password is incorrect." }));
    await flushPromises();

    expect(isLoggedIn.value).toBe(true);
  });

  it("puts the key back on Cancel or Escape, forgetting what was typed", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    const { wrapper } = await mountPanel();

    await open(wrapper);
    await wrapper.find("input").setValue("wrong");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);

    await open(wrapper);
    expect(wrapper.find("input").element.value).toBe("");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find("form").exists()).toBe(false);
    wrapper.unmount();
  });
  /** Opens the form of an account made with GitHub and sends its username, which the API answers with `status`. */
  const sendUsername = async (status: number, error: string) => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error }));
    const mounted = await mountPanel();
    await open(mounted.wrapper);
    await mounted.wrapper.find("input").setValue("me");
    await mounted.wrapper.find("form").trigger("submit");
    await flushPromises();
    return mounted;
  };

  it("sends an account made with GitHub to confirm it's them first", async () => {
    const { wrapper, router } = await sendUsername(403, REAUTH);

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ username: "me" });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    const info = wrapper.find('[role="status"]');
    expect(info.text()).toBe(REAUTH);
    expect(info.classes()).toContain("status--info");
    expect(deleteKey(wrapper).exists()).toBe(false);
    const confirm = githubKey(wrapper);
    expect(confirm.text()).toBe("Confirm with GitHub");
    expect(confirm.classes()).toContain("btn--primary");
    expect(document.activeElement).toBe(confirm.element);
    expect(confirm.attributes("aria-describedby")).toBe(info.attributes("id"));
    expect(confirm.attributes("aria-describedby")).toBeTruthy();
    const hintId = wrapper.find(".field__hint").attributes("id");
    expect(wrapper.find("input").attributes("aria-describedby")).toBe(
      `${info.attributes("id")} ${hintId}`
    );
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual(["Cancel"]);
    expect(isLoggedIn.value).toBe(true);
    expect(router.currentRoute.value.fullPath).toBe("/account");
    wrapper.unmount();
  });

  it("remembers the delete for the way back when GitHub is opened", async () => {
    const { wrapper } = await sendUsername(403, REAUTH);
    expect(sessionStorage.length).toBe(0);
    // jsdom can't leave the page; the click is what counts.
    githubKey(wrapper).element.addEventListener("click", (event) => event.preventDefault());

    await githubKey(wrapper).trigger("click");

    expect(takeDeleteIntent()).toBe("me");
    wrapper.unmount();
  });

  it("keeps the GitHub key while the username is edited, since GitHub still has to confirm", async () => {
    const { wrapper } = await sendUsername(403, REAUTH);

    await wrapper.find("input").setValue("m");
    await wrapper.find("input").setValue("me");

    expect(githubKey(wrapper).exists()).toBe(true);
    expect(wrapper.find('[role="status"]').text()).toBe(REAUTH);
    wrapper.unmount();
  });

  it("asks again when the username is sent again", async () => {
    const { wrapper } = await sendUsername(403, REAUTH);
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: REAUTH }));
    (document.activeElement as HTMLElement).blur();

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(githubKey(wrapper).element);
    wrapper.unmount();
  });

  it.each([
    ["Cancel", (wrapper: Wrapper) => wrapper.find("button").trigger("click")],
    ["Escape", (wrapper: Wrapper) => githubKey(wrapper).trigger("keydown", { key: "Escape" })]
  ])("forgets the GitHub step and the remembered delete on %s", async (_name, close) => {
    const { wrapper } = await sendUsername(403, REAUTH);
    saveDeleteIntent("me");

    await close(wrapper);
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find("button").element);
    expect(takeDeleteIntent()).toBe("");

    await open(wrapper);
    expect(githubKey(wrapper).exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(deleteKey(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });

  it("drops the GitHub step once the account sets a password", async () => {
    const { wrapper } = await sendUsername(403, REAUTH);

    hasPassword.value = true;
    await flushPromises();

    expect(githubKey(wrapper).exists()).toBe(false);
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find("label").text()).toBe("Password");
    expect(deleteKey(wrapper).exists()).toBe(true);
    wrapper.unmount();
  });

  it("keeps another 403 an error, with the delete key", async () => {
    const error = "The provided username doesn't match this account.";
    const { wrapper } = await sendUsername(403, error);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(wrapper.find('[role="alert"]').text()).toBe(error);
    expect(githubKey(wrapper).exists()).toBe(false);
    expect(deleteKey(wrapper).exists()).toBe(true);
    expect(document.activeElement).toBe(wrapper.find("input").element);
    expect(isLoggedIn.value).toBe(true);
    wrapper.unmount();
  });

  it("logs the page out when the API says the session ended", async () => {
    const error = "You must be logged in to perform this action.";
    // The delete answers it, and so does the GET /user that it sends to check.
    fetchMock.mockResolvedValue(jsonResponse(403, { error }));
    const { wrapper } = await sendUsername(403, error);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/user");
    expect(wrapper.find('[role="alert"]').text()).toBe(error);
    expect(isLoggedIn.value).toBe(false);
    expect(sessionEnded.value).toBe(true);
    wrapper.unmount();
  });

  const CONFIRMED = "GitHub confirmed it's you. Delete the account within 10 minutes.";

  it("opens again for a user back from GitHub, saying so where the focus lands", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "User deleted successfully." }));
    const { wrapper, router } = await mountPanel({ reopen: true });
    await flushPromises();

    const input = wrapper.find("input");
    expect(wrapper.find("form").exists()).toBe(true);
    const confirmed = wrapper.find('form [role="status"]');
    expect(confirmed.text()).toBe(CONFIRMED);
    expect(confirmed.classes()).toContain("status--info");
    // Above the field, so it's on screen with it.
    expect(wrapper.find("form").element.firstElementChild).toBe(confirmed.element);
    expect(wrapper.find("label").text()).toBe("Username");
    expect(input.element.value).toBe("");
    expect(document.activeElement).toBe(input.element);
    const hintId = wrapper.find(".field__hint").attributes("id");
    expect(input.attributes("aria-describedby")).toBe(`${confirmed.attributes("id")} ${hintId}`);
    expect(deleteKey(wrapper).attributes("aria-disabled")).toBe("true");

    await input.setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({ username: "me" });
    expect(router.currentRoute.value.fullPath).toBe("/");
    wrapper.unmount();
  });

  it("drops the confirmation once the delete is tried again, leaving the refusal", async () => {
    hasPassword.value = false;
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Something went wrong." }));
    const { wrapper } = await mountPanel({ reopen: true });
    await flushPromises();

    await wrapper.find("input").setValue("me");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    const alertId = wrapper.find('[role="alert"]').attributes("id");
    const hintId = wrapper.find(".field__hint").attributes("id");
    expect(wrapper.find("input").attributes("aria-describedby")).toBe(`${alertId} ${hintId}`);
    wrapper.unmount();
  });

  it("drops the confirmation on Cancel", async () => {
    hasPassword.value = false;
    const { wrapper } = await mountPanel({ reopen: true });
    await flushPromises();

    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    await open(wrapper);

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find("input").attributes("aria-describedby")).toBe(
      wrapper.find(".field__hint").attributes("id")
    );
    wrapper.unmount();
  });

  it("drops the confirmation once the account sets a password", async () => {
    hasPassword.value = false;
    const { wrapper } = await mountPanel({ reopen: true });
    await flushPromises();

    hasPassword.value = true;
    await flushPromises();

    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("warns an account made with GitHub that GitHub may confirm it's them first", async () => {
    hasPassword.value = false;
    const { wrapper } = await mountPanel();

    expect(wrapper.find(".delete__note").text()).toBe(
      "Deleting your account also deletes your pastes, short links and uploads. It can't be undone. If you logged in more than 10 minutes ago, GitHub confirms it's you first."
    );
    wrapper.unmount();
  });

  /** A `pageshow`, as when the browser's Back key brings the page back from GitHub. */
  const pageShow = (persisted: boolean) =>
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted }));

  it("forgets a delete when the page comes back from GitHub without loading again", async () => {
    const { wrapper } = await mountPanel();
    saveDeleteIntent("me");

    pageShow(false);
    expect(sessionStorage.length).toBe(1);
    pageShow(true);

    expect(takeDeleteIntent()).toBe("");
    wrapper.unmount();
  });

  it("stops listening for the page coming back once it's gone", async () => {
    const { wrapper } = await mountPanel();
    wrapper.unmount();
    saveDeleteIntent("me");

    pageShow(true);

    expect(takeDeleteIntent()).toBe("me");
  });
});
