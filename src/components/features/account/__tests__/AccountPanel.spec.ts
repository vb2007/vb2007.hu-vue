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
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

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
    expect(wrapper.find("#delete-title").text()).toBe("Delete account");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("offers to change the password in the log-in details", async () => {
    logIn();
    hasPassword.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    const details = wrapper.find('[aria-labelledby="details-title"]');
    expect(details.find("h2").text()).toBe("Log-in details");
    expect(details.find("h3").text()).toBe("Password");
    expect(details.find(".login__note").text()).toBe(
      "Changing it logs out your other devices; you stay logged in here."
    );
    expect(details.find("button").text()).toBe("Change password");
  });

  it("has no password to change on an account made with GitHub", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(AccountPanel);

    const details = wrapper.find('[aria-labelledby="details-title"]');
    expect(details.find(".login__note").text()).toBe(
      "None yet. Set one in the Password section below."
    );
    expect(details.find("button").exists()).toBe(false);
  });

  const linkGithub = (login = "octocat", password = true) => {
    logIn();
    githubLinked.value = true;
    githubLogin.value = login;
    hasPassword.value = password;
  };

  const unlinkKey = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
    wrapper.find("button.login__action");

  const githubNote = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
    wrapper.find('[aria-labelledby="logins-title"] .login__note');

  it("shows the linked GitHub login with an unlink key instead of the link key", async () => {
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".badge").text()).toBe("Linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--on");
    expect(githubNote(wrapper).text()).toBe("You can log in with GitHub as @octocat.");
    expect(wrapper.find(".login__handle").text()).toBe("@octocat");
    expect(wrapper.find('a[href="https://api.test/auth/github/link"]').exists()).toBe(false);
    expect(unlinkKey(wrapper).text()).toBe("Unlink GitHub");
  });

  it("leaves the login out when the API doesn't know it yet", async () => {
    linkGithub("");
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(githubNote(wrapper).text()).toBe("You can log in with GitHub.");
  });

  it("keeps GitHub linked on an account without a password", async () => {
    linkGithub("octocat", false);
    const { wrapper } = await mountWithRouter(AccountPanel);

    // Two sentences from two template branches; the browser collapses the doubled space between them.
    expect(githubNote(wrapper).text().replace(/\s+/g, " ")).toBe(
      "You can log in with GitHub as @octocat. It stays linked while it's your only way to log in."
    );
    expect(unlinkKey(wrapper).exists()).toBe(false);
  });

  it("unlinks GitHub on the second click and says so", async () => {
    const fetchMock = mockFetch();
    let answer!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (answer = resolve)));
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel);

    await unlinkKey(wrapper).trigger("click");
    expect(unlinkKey(wrapper).text()).toBe("Confirm unlink");
    expect(unlinkKey(wrapper).classes()).toContain("btn--error");
    expect(fetchMock).not.toHaveBeenCalled();

    await unlinkKey(wrapper).trigger("click");
    expect(unlinkKey(wrapper).text()).toBe("Unlinking");
    answer(jsonResponse(200, { message: "Unlinked." }));
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/auth/github/link", {
      method: "DELETE",
      credentials: "include"
    });
    expect(wrapper.find('[role="status"]').text()).toBe(
      "GitHub is unlinked. Log in with your password from now on."
    );
    expect(wrapper.find(".badge").text()).toBe("Not linked");
    expect(wrapper.find('a[href="https://api.test/auth/github/link"]').exists()).toBe(true);
  });

  it("disarms the unlink key after a while", async () => {
    vi.useFakeTimers();
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel);

    await unlinkKey(wrapper).trigger("click");
    await vi.advanceTimersByTimeAsync(4000);

    expect(unlinkKey(wrapper).text()).toBe("Unlink GitHub");
    wrapper.unmount();
  });

  it("shows why unlinking failed and keeps GitHub linked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(
      jsonResponse(403, { error: "This account has no password." })
    );
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel);

    await unlinkKey(wrapper).trigger("click");
    await unlinkKey(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("This account has no password.");
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find(".badge").text()).toBe("Linked");
  });

  it("confirms a GitHub account the API just linked, once", async () => {
    linkGithub();
    const { wrapper, router } = await mountWithRouter(AccountPanel, {}, "/account?github=linked");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(
      "GitHub is linked. You can log in with it from now on."
    );
    expect(router.currentRoute.value.fullPath).toBe("/account");
  });

  it("offers to set a password only to an account without one", async () => {
    linkGithub("octocat", false);
    const { wrapper } = await mountWithRouter(AccountPanel);
    expect(wrapper.find("#password-title").exists()).toBe(true);

    hasPassword.value = true;
    await flushPromises();
    expect(wrapper.find("#password-title").exists()).toBe(false);
  });

  it("says the password is set, and offers to unlink GitHub instead of the form", async () => {
    linkGithub("octocat", false);
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?github=linked"
    );
    await flushPromises();
    expect(wrapper.find('[role="status"]').text()).toBe(
      "GitHub confirmed it's you. Set your password within 10 minutes."
    );

    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password set successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", githubId: "583231", hasPassword: true })
      );
    for (const input of wrapper.findAll('input[type="password"]')) {
      await input.setValue("correct horse");
    }
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe(
      "Your password is set. You can log in with it from now on."
    );
    expect(wrapper.find("#password-title").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find('[role="status"]').element);
    expect(unlinkKey(wrapper).text()).toBe("Unlink GitHub");
    expect(wrapper.find("button.change__key").text()).toBe("Change password");
    wrapper.unmount();
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
