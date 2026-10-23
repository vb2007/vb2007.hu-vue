import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import GithubLogin from "@/components/features/auth/GithubLogin.vue";

describe("GithubLogin", () => {
  it("links to the API's GitHub login with the given label", () => {
    const wrapper = mount(GithubLogin, { props: { label: "Log in with GitHub" } });
    const link = wrapper.find("a");

    expect(wrapper.find(".github__or").text()).toBe("or");
    expect(link.attributes("href")).toBe("https://api.test/auth/github");
    expect(link.text()).toBe("Log in with GitHub");
    expect(link.find("svg").attributes("viewBox")).toBe("0 0 16 16");
  });
});
