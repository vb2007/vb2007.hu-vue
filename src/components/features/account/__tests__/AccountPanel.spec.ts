import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import {
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const logIn = () => {
  isSessionChecked.value = true;
  isLoggedIn.value = true;
  username.value = "vb";
  userEmail.value = "vb@example.com";
};

describe("AccountPanel", () => {
  it("shows nothing until the session is known", async () => {
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find("section").exists()).toBe(false);
  });

  it("asks a visitor to log in or register", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find("h1").text()).toBe("Account");
    expect(wrapper.find('[role="status"]').text()).toBe("Log in to see your account.");
    expect(wrapper.findAll("a").map((link) => link.attributes("href"))).toEqual([
      "/login",
      "/register"
    ]);
  });

  it("shows the account and offers to link GitHub", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find("h1").text()).toBe("Your account");
    expect(wrapper.findAll("dd").map((value) => value.text())).toEqual(["vb", "vb@example.com"]);
    expect(wrapper.find(".badge").text()).toBe("Not linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--off");
    expect(wrapper.find('a[href="https://api.test/auth/github/link"]').text()).toBe("Link GitHub");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows a linked GitHub account by its login, without the link key", async () => {
    logIn();
    githubLinked.value = true;
    githubLogin.value = "octocat";
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".badge").text()).toBe("Linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--on");
    expect(wrapper.find(".login__handle").text()).toBe("@octocat");
    expect(wrapper.find(".login__note").text()).toBe(
      "You can log in with GitHub or your password."
    );
    expect(wrapper.find('a[href="https://api.test/auth/github/link"]').exists()).toBe(false);
    expect(wrapper.find(".login__action").text()).toBe("Unlink GitHub");
  });

  it("leaves out the login when the API hasn't stored it yet", async () => {
    logIn();
    githubLinked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".login__handle").exists()).toBe(false);
  });

  it("keeps GitHub linked on an account without a password", async () => {
    logIn();
    githubLinked.value = true;
    hasPassword.value = false;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".login__note").text()).toBe(
      "This account has no password, so GitHub is how you log in. It can't be unlinked."
    );
    expect(wrapper.find(".login__action").exists()).toBe(false);
  });

  it("unlinks GitHub on the second click", async () => {
    const fetchMock = mockFetch();
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    logIn();
    githubLinked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    await wrapper.find(".login__action").trigger("click");
    expect(wrapper.find(".login__action").text()).toBe("Confirm unlink");
    expect(fetchMock).not.toHaveBeenCalled();

    await wrapper.find(".login__action").trigger("click");
    expect(wrapper.find(".login__action").text()).toBe("Unlinking");
    answer(jsonResponse(200, { message: "Unlinked." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(wrapper.find('[role="status"]').text()).toBe(
      "GitHub is unlinked. You can link it again any time."
    );
    expect(wrapper.find(".badge").text()).toBe("Not linked");
    expect(wrapper.find(".login__action").text()).toBe("Link GitHub");
  });

  it("disarms the unlink key after a while", async () => {
    vi.useFakeTimers();
    logIn();
    githubLinked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    await wrapper.find(".login__action").trigger("click");
    vi.advanceTimersByTime(4000);
    await flushPromises();

    expect(wrapper.find(".login__action").text()).toBe("Unlink GitHub");
    wrapper.unmount();
  });

  it("explains a refused unlink", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(
      jsonResponse(403, { error: "This account has no password." })
    );
    logIn();
    githubLinked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    await wrapper.find(".login__action").trigger("click");
    await wrapper.find(".login__action").trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("This account has no password.");
    expect(wrapper.find(".badge").text()).toBe("Linked");
  });

  it("confirms a finished GitHub link", async () => {
    logIn();
    githubLinked.value = true;
    const { wrapper, router } = await mountWithRouter(AccountPanel, {}, "/account?github=linked");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(
      "GitHub is linked. You can log in with it from now on."
    );
    expect(router.currentRoute.value.fullPath).toBe("/account");
  });

  it("explains a failed GitHub link, logged in or not", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      {},
      "/account?oauthError=githubAlreadyLinked"
    );
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      "That GitHub account is already linked to another account here."
    );

    isLoggedIn.value = false;
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
  });
});
