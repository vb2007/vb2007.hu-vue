import { describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import AccountPanel from "@/components/features/account/AccountPanel.vue";
import {
  githubLinked,
  isLoggedIn,
  isSessionChecked,
  userEmail,
  username
} from "@/scripts/authentication/authState";
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
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it("shows a linked GitHub account without the link key", async () => {
    logIn();
    githubLinked.value = true;
    const { wrapper } = await mountWithRouter(AccountPanel);

    expect(wrapper.find(".badge").text()).toBe("Linked");
    expect(wrapper.find(".badge").classes()).toContain("badge--on");
    expect(wrapper.find(".login__note").text()).toBe("You can log in with GitHub.");
    expect(wrapper.find('a[href="https://api.test/auth/github/link"]').exists()).toBe(false);
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
