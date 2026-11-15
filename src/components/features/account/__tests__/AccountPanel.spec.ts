import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import {
  emailVerified,
  githubLinked,
  githubLogin,
  hasPassword,
  isLoggedIn,
  isSessionChecked,
  isSuperuser,
  pendingEmail,
  sessionEnded,
  userEmail,
  username
} from "@/scripts/authentication/authState";
import { COOLDOWN_STORAGE_KEY } from "@/composables/useChangeEmail";
import { DELETE_INTENT_STORAGE_KEY, saveDeleteIntent } from "@/scripts/authentication/deleteIntent";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const logIn = () => {
  isSessionChecked.value = true;
  isLoggedIn.value = true;
  username.value = "vb";
  userEmail.value = "vb@example.com";
};

/** The GitHub row's key: Link GitHub or Unlink GitHub. */
const githubKey = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
  wrapper.find('[aria-labelledby="logins-title"] button.github__key');

describe("AccountPanel", () => {
  beforeEach(() => sessionStorage.clear());

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

  it("says the session ended when the API logged the page out, and moves focus there", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });

    // What fetchUserDetails does with GET /user's 403, e.g. after a login on another device.
    isLoggedIn.value = false;
    sessionEnded.value = true;
    await flushPromises();

    expect(wrapper.find("h1").text()).toBe("Account");
    const status = wrapper.find('[role="status"]');
    expect(status.text()).toBe(
      "Your session ended, so you're logged out: it expired, the password was reset, or the account was logged in or out elsewhere. Log in again to see your account."
    );
    expect(document.activeElement).toBe(status.element);
    expect(wrapper.findAll("a").map((link) => link.attributes("href"))).toEqual([
      "/login",
      "/register"
    ]);
    wrapper.unmount();
  });

  it("goes back to asking to log in once the ended session's notice is gone", async () => {
    isSessionChecked.value = true;
    sessionEnded.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);
    expect(wrapper.find('[role="status"]').text()).toMatch(/^Your session ended/);

    sessionEnded.value = false;
    await flushPromises();

    expect(wrapper.find('[role="status"]').text()).toBe("Log in to see your account.");
  });

  it("shows the account and offers to link GitHub", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find("h1").text()).toBe("Your account");
    expect(wrapper.findAll("dd").map((value) => value.text())).toEqual(["vb", "vb@example.com"]);
    expect(wrapper.find(".badge").text()).toBe("Not linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--off");
    expect(githubKey(wrapper).text()).toBe("Link GitHub");
    expect(wrapper.find("#delete-title").text()).toBe("Delete account");
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  /** A row of the log-in details, by its name. */
  const detailsRow =
    (name: string) => (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
      wrapper
        .findAll('[aria-labelledby="details-title"] .login')
        .find((row) => row.find("h3").text() === name)!;
  const passwordRow = detailsRow("Password");
  const emailRow = detailsRow("E-mail");

  it("offers to change the password in the log-in details", async () => {
    logIn();
    hasPassword.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find("#details-title").text()).toBe("Log-in details");
    expect(passwordRow(wrapper).find(".login__note").text()).toBe(
      "Changing it logs out your other devices; you stay logged in here."
    );
    expect(passwordRow(wrapper).find("button").text()).toBe("Change password");
  });

  it("has no password to change on an account made with GitHub", async () => {
    logIn();
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(passwordRow(wrapper).find(".login__note").text()).toBe(
      "None yet. Set one in the Password section below."
    );
    expect(passwordRow(wrapper).find("button").exists()).toBe(false);
  });

  const linkGithub = (login = "octocat", password = true) => {
    logIn();
    githubLinked.value = true;
    githubLogin.value = login;
    hasPassword.value = password;
  };

  const githubNote = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
    wrapper.find('[aria-labelledby="logins-title"] .login__note');

  const githubRow = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
    wrapper.find('[aria-labelledby="logins-title"] .login');

  /** Opens the GitHub row's form and confirms the unlink with `password`. */
  const unlinkWith = async (
    wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"],
    password: string
  ) => {
    await githubKey(wrapper).trigger("click");
    await flushPromises();
    await githubRow(wrapper).find('input[type="password"]').setValue(password);
    await githubRow(wrapper).find("form").trigger("submit");
    await flushPromises();
  };

  it("shows the linked GitHub login with an unlink key instead of the link key", async () => {
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".badge").text()).toBe("Linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--on");
    expect(githubNote(wrapper).text()).toBe("You can log in with GitHub as @octocat.");
    expect(wrapper.find(".login__handle").text()).toBe("@octocat");
    expect(githubKey(wrapper).text()).toBe("Unlink GitHub");
  });

  it.each([
    [true, "Link it to log in with GitHub instead of typing your password."],
    [false, "Link it to log in with GitHub."]
  ])("says what linking GitHub is for (password: %s)", async (password, note) => {
    logIn();
    hasPassword.value = password;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(githubNote(wrapper).text()).toBe(note);
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
    expect(githubKey(wrapper).exists()).toBe(false);
  });

  it("unlinks GitHub with the password, says so and moves focus to the message", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { message: "Unlinked." }));
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });

    await unlinkWith(wrapper, "hunter22");

    expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
      password: "hunter22"
    });
    const notice = wrapper.find('[role="status"]');
    expect(notice.text()).toBe("GitHub is unlinked. Log in with your password from now on.");
    expect(document.activeElement).toBe(notice.element);
    expect(wrapper.find(".badge").text()).toBe("Not linked");
    expect(githubKey(wrapper).text()).toBe("Link GitHub");
    wrapper.unmount();
  });

  it("shows why unlinking failed in its form and keeps GitHub linked", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(
      jsonResponse(403, { error: "The provided password is incorrect." })
    );
    linkGithub();
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });

    await unlinkWith(wrapper, "wrong");

    expect(githubRow(wrapper).find('form [role="alert"]').text()).toBe(
      "The provided password is incorrect."
    );
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    expect(wrapper.find(".badge").text()).toBe("Linked");
    wrapper.unmount();
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
    expect(githubKey(wrapper).text()).toBe("Unlink GitHub");
    expect(wrapper.find("button.change__key").text()).toBe("Change password");
    wrapper.unmount();
  });

  it.each([
    ["password", passwordRow],
    ["e-mail", emailRow],
    ["GitHub", githubRow]
  ])("drops the top notice once the %s form opens", async (_name, row) => {
    linkGithub();
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?github=linked"
    );
    await flushPromises();
    expect(wrapper.find(".notice").exists()).toBe(true);

    await row(wrapper).find("button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".notice").exists()).toBe(false);
    wrapper.unmount();
  });

  it("drops a failed GitHub link once the password changes", async () => {
    linkGithub();
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?oauthError=githubAlreadyLinked"
    );
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          email: "vb@example.com",
          githubId: "583231",
          githubLogin: "octocat",
          hasPassword: true
        })
      );

    await passwordRow(wrapper).find("button").trigger("click");
    await flushPromises();
    for (const input of passwordRow(wrapper).findAll('input[type="password"]')) {
      await input.setValue("battery staple");
    }
    await passwordRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('[role="status"]').map((status) => status.text())).toEqual([
      "Password changed successfully."
    ]);
    wrapper.unmount();
  });

  it("takes a waiting e-mail change and its countdown away once the password changes", async () => {
    logIn();
    hasPassword.value = true;
    pendingEmail.value = "new@example.com";
    // The code was sent moments ago, so Send code still counts down (kept for a reload).
    sessionStorage.setItem(
      COOLDOWN_STORAGE_KEY,
      JSON.stringify({ id: "vb@example.com", deadline: Date.now() + 50_000 })
    );
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });
    const changeKey = () =>
      emailRow(wrapper)
        .findAll("button")
        .find((button) => button.text() === "Change e-mail")!;
    await changeKey().trigger("click");
    await flushPromises();
    expect(emailRow(wrapper).find('button[type="submit"]').text()).toMatch(
      /^Send code in \d+ sec$/
    );
    await emailRow(wrapper).find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", hasPassword: true, pendingEmail: null })
      );

    await passwordRow(wrapper).find("button").trigger("click");
    await flushPromises();
    for (const input of passwordRow(wrapper).findAll('input[type="password"]')) {
      await input.setValue("battery staple");
    }
    await passwordRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(passwordRow(wrapper).find('[role="status"]').text()).toBe(
      "Password changed successfully. The change to new@example.com was cancelled, so its code no longer works: get a new one with Change e-mail."
    );
    expect(emailRow(wrapper).text()).not.toContain("Waiting for confirmation");
    expect(emailRow(wrapper).find('input[autocomplete="one-time-code"]').exists()).toBe(false);
    expect(sessionStorage.getItem(COOLDOWN_STORAGE_KEY)).toBeNull();
    await changeKey().trigger("click");
    await flushPromises();
    expect(emailRow(wrapper).find('button[type="submit"]').text()).toBe("Send code");
    wrapper.unmount();
  });

  it("leaves no earlier confirm error behind once the password change drops the change", async () => {
    logIn();
    hasPassword.value = true;
    pendingEmail.value = "new@example.com";
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", hasPassword: true, pendingEmail: null })
      );
    await emailRow(wrapper).find('input[autocomplete="one-time-code"]').setValue("123456");
    await emailRow(wrapper).find("form").trigger("submit");
    await flushPromises();
    expect(emailRow(wrapper).find('[role="alert"]').text()).toBe("Error connecting to server");

    await passwordRow(wrapper).find("button").trigger("click");
    await flushPromises();
    for (const input of passwordRow(wrapper).findAll('input[type="password"]')) {
      await input.setValue("battery staple");
    }
    await passwordRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(passwordRow(wrapper).find('[role="status"]').text()).toMatch(/was cancelled/);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("doesn't leave a refusal that took the change away under a later password change", async () => {
    logIn();
    hasPassword.value = true;
    pendingEmail.value = "new@example.com";
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });
    mockFetch()
      // The last of the code's tries (or a password change in another tab): the change is gone.
      .mockResolvedValueOnce(jsonResponse(400, { error: "The code is wrong." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", hasPassword: true, pendingEmail: null })
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", hasPassword: true, pendingEmail: null })
      );
    await emailRow(wrapper).find('input[autocomplete="one-time-code"]').setValue("123456");
    await emailRow(wrapper).find("form").trigger("submit");
    await flushPromises();
    expect(emailRow(wrapper).find('[role="alert"]').text()).toMatch(/^new@example.com wasn't/);

    await passwordRow(wrapper).find("button").trigger("click");
    await flushPromises();
    for (const input of passwordRow(wrapper).findAll('input[type="password"]')) {
      await input.setValue("battery staple");
    }
    await passwordRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(passwordRow(wrapper).find('[role="status"]').text()).toBe(
      "Password changed successfully."
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("drops the top notice once a waiting e-mail change is confirmed", async () => {
    linkGithub();
    pendingEmail.value = "new@example.com";
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?github=linked"
    );
    await flushPromises();
    expect(wrapper.find(".notice").exists()).toBe(true);
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, { message: "E-mail address updated successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "new@example.com", hasPassword: true, pendingEmail: null })
      );

    await emailRow(wrapper).find("input").setValue("123456");
    await emailRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".notice").exists()).toBe(false);
    expect(emailRow(wrapper).find('[role="status"]').text()).toBe(
      "E-mail address updated successfully."
    );
    wrapper.unmount();
  });

  it("drops a failed GitHub link once the password is set", async () => {
    linkGithub("octocat", false);
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?oauthError=githubAlreadyLinked"
    );
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
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

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.findAll('[role="status"]').map((status) => status.text())).toEqual([
      "Your password is set. You can log in with it from now on."
    ]);
    wrapper.unmount();
  });

  it("drops a failed GitHub link once the GitHub form opens", async () => {
    linkGithub();
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?oauthError=githubAlreadyLinked"
    );
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);

    await githubKey(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it("drops a failed GitHub link once an account made with GitHub links again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(jsonResponse(500, { error: "Something broke." }));
    logIn();
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      { attachTo: document.body },
      "/account?oauthError=accessDenied"
    );
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe(
      "GitHub login was cancelled, so nothing changed."
    );

    await githubKey(wrapper).trigger("click");
    await flushPromises();

    expect(wrapper.findAll('[role="alert"]').map((alert) => alert.text())).toEqual([
      "Something broke."
    ]);
    wrapper.unmount();
  });

  it("explains a link started without the password", async () => {
    logIn();
    hasPassword.value = true;
    const { wrapper } = await mountWithRouter(
      AccountPanel,
      {},
      "/account?oauthError=passwordRequired"
    );
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe(
      "Linking GitHub takes your password. Press Link GitHub on this page and enter it there."
    );
    expect(githubKey(wrapper).text()).toBe("Link GitHub");
  });

  it("shows only the password change after setting the password", async () => {
    linkGithub("octocat", false);
    const { wrapper } = await mountWithRouter(AccountPanel, { attachTo: document.body });
    mockFetch()
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password set successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", githubId: "583231", hasPassword: true })
      )
      .mockResolvedValueOnce(jsonResponse(200, { message: "Password changed successfully." }))
      .mockResolvedValueOnce(
        jsonResponse(200, { email: "vb@example.com", githubId: "583231", hasPassword: true })
      );
    for (const input of wrapper.findAll('input[type="password"]')) {
      await input.setValue("correct horse");
    }
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find(".notice").exists()).toBe(true);

    await passwordRow(wrapper).find("button").trigger("click");
    await flushPromises();
    for (const input of passwordRow(wrapper).findAll('input[type="password"]')) {
      await input.setValue("battery staple");
    }
    await passwordRow(wrapper).find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.findAll('[role="status"]').map((status) => status.text())).toEqual([
      "Password changed successfully."
    ]);
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

  it("offers to change the e-mail address of an account with a password", async () => {
    logIn();
    hasPassword.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(
      wrapper.findAll('[aria-labelledby="details-title"] h3').map((name) => name.text())
    ).toEqual(["Password", "E-mail"]);
    expect(emailRow(wrapper).find(".login__mark path").attributes("d")).toMatch(/^M3\.5 5\.5h17/);
    expect(emailRow(wrapper).find(".login__note").text()).toBe(
      "You log in with it. Changing it takes your current password."
    );
    expect(emailRow(wrapper).find("button").text()).toBe("Change e-mail");
    expect(emailRow(wrapper).find(".badge").exists()).toBe(false);
  });

  it("marks a confirmed address", async () => {
    logIn();
    hasPassword.value = true;
    emailVerified.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    const badge = emailRow(wrapper).find(".login__head .badge");
    expect(badge.text()).toBe("Confirmed");
    expect(badge.classes()).toContain("badge--on");
  });

  it("asks for the code of a change that's waiting, under the current address", async () => {
    logIn();
    hasPassword.value = true;
    emailVerified.value = true;
    pendingEmail.value = "new@example.com";
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.findAll("dd").map((value) => value.text())).toEqual(["vb", "vb@example.com"]);
    // A Confirmed badge would read as being about the waiting address.
    expect(emailRow(wrapper).find(".badge").exists()).toBe(false);
    expect(emailRow(wrapper).find(".change__pending").text()).toBe(
      "Waiting for confirmation: new@example.com"
    );
    expect(emailRow(wrapper).find("label").text()).toBe("Confirmation code");
  });

  it.each([
    ["an account without a password", false, false, "Changing it needs a password."],
    ["the superuser", true, true, "It's set in the API's configuration."]
  ])("explains why %s can't change its e-mail", async (_who, password, superuser, note) => {
    logIn();
    hasPassword.value = password;
    isSuperuser.value = superuser;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(emailRow(wrapper).find(".login__note").text()).toBe(note);
    expect(emailRow(wrapper).find("button").exists()).toBe(false);
  });
  describe("back from GitHub, which the delete form sent the user to", () => {
    const deleteField = (wrapper: Awaited<ReturnType<typeof mountWithRouter>>["wrapper"]) =>
      wrapper.find<HTMLInputElement>('[aria-labelledby="delete-title"] input');

    const comeBack = async (path = "/account?github=linked") => {
      const mounted = await mountWithRouter(AccountPanel, { attachTo: document.body }, path);
      await flushPromises();
      return mounted;
    };

    it("opens the delete form again, which says so itself, with the username to type again", async () => {
      linkGithub("octocat", false);
      saveDeleteIntent("vb");
      const { wrapper, router } = await comeBack();

      // Said once, in the delete form where the focus lands, not again at the top of the board.
      expect(wrapper.find(".notice").exists()).toBe(false);
      expect(wrapper.findAll('[role="status"]').map((status) => status.text())).toEqual([
        "GitHub confirmed it's you. Delete the account within 10 minutes."
      ]);
      expect(router.currentRoute.value.fullPath).toBe("/account");
      const field = deleteField(wrapper);
      expect(field.element.value).toBe("");
      expect(document.activeElement).toBe(field.element);
      expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
      wrapper.unmount();
    });

    it("leaves nothing about the delete on screen once it's cancelled", async () => {
      linkGithub("octocat", false);
      saveDeleteIntent("vb");
      const { wrapper } = await comeBack();

      await deleteField(wrapper).trigger("keydown", { key: "Escape" });
      await flushPromises();

      expect(deleteField(wrapper).exists()).toBe(false);
      expect(wrapper.find('[role="status"]').exists()).toBe(false);
      wrapper.unmount();
    });

    it("takes a delete sent to GitHub too long ago as a confirmation for the password", async () => {
      linkGithub("octocat", false);
      saveDeleteIntent("vb");
      const now = Date.now();
      vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000);
      const { wrapper } = await comeBack();

      expect(wrapper.find(".notice").text()).toBe(
        "GitHub confirmed it's you. Set your password within 10 minutes."
      );
      expect(deleteField(wrapper).exists()).toBe(false);
      expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
      wrapper.unmount();
    });

    it("doesn't open another account's delete form", async () => {
      linkGithub("octocat", false);
      saveDeleteIntent("someone-else");
      const { wrapper } = await comeBack();

      expect(wrapper.find(".notice").text()).toBe(
        "GitHub confirmed it's you. Set your password within 10 minutes."
      );
      expect(deleteField(wrapper).exists()).toBe(false);
      wrapper.unmount();
    });

    it("forgets a delete when GitHub didn't confirm it", async () => {
      linkGithub("octocat", false);
      saveDeleteIntent("vb");
      const { wrapper } = await comeBack("/account?oauthError=accessDenied");

      expect(wrapper.find('[role="alert"]').text()).toBe(
        "GitHub login was cancelled, so nothing changed."
      );
      expect(wrapper.find(".notice").exists()).toBe(false);
      expect(deleteField(wrapper).exists()).toBe(false);
      expect(sessionStorage.getItem(DELETE_INTENT_STORAGE_KEY)).toBeNull();
      wrapper.unmount();
    });

    it("leaves an account that has a password meanwhile to its own delete", async () => {
      linkGithub("octocat", true);
      saveDeleteIntent("vb");
      const { wrapper } = await comeBack();

      expect(wrapper.find(".notice").text()).toBe(
        "GitHub is linked. You can log in with it from now on."
      );
      expect(deleteField(wrapper).exists()).toBe(false);
      wrapper.unmount();
    });
  });
});
