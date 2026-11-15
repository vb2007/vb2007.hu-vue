import { afterEach, describe, expect, it } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import MfaStep from "@/components/features/auth/MfaStep.vue";

let wrapper: VueWrapper | undefined;
afterEach(() => wrapper?.unmount());

describe("MfaStep with several methods", () => {
  it("opens the preferred one the API offers, and switches between them", async () => {
    wrapper = mount(MfaStep, {
      props: { methods: ["email", "totp", "recovery"] },
      attachTo: document.body
    });
    expect(wrapper.find("h2").text()).toBe("Authenticator app");
    expect(wrapper.find(".mfa__others button").text()).toBe("Use an e-mail code");

    await wrapper.find(".mfa__others button").trigger("click");

    expect(wrapper.find("h2").text()).toBe("E-mail code");
    expect(wrapper.find("input").exists()).toBe(false);
    expect(document.activeElement).toBe(wrapper.find(".mfa__lead").element);
    expect(wrapper.find(".mfa__others button").text()).toBe("Use your authenticator app");
  });

  it("offers only the methods the API lists", () => {
    wrapper = mount(MfaStep, { props: { methods: ["email", "recovery"] } });

    expect(wrapper.find("h2").text()).toBe("E-mail code");
    expect(wrapper.find(".mfa__others").exists()).toBe(false);
  });
});
