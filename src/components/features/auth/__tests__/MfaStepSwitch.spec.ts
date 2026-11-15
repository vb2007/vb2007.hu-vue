import { afterEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
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

  it("keeps a method's state across a switch away and back, e.g. the mailed code and its countdown", async () => {
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { message: "Sent." }));
    wrapper = mount(MfaStep, { props: { methods: ["email", "totp"] }, attachTo: document.body });
    await wrapper.find(".mfa__others button").trigger("click");
    await wrapper.find(".email__send button").trigger("click");
    await flushPromises();
    await wrapper.find("input").setValue("12");

    await wrapper.find(".mfa__others button").trigger("click");
    expect(wrapper.find("h2").text()).toBe("Authenticator app");
    await wrapper.find(".mfa__others button").trigger("click");

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("12");
    expect(wrapper.find(".email__send button").text()).toMatch(/^Send again in \d+\ssec$/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("offers only the methods the API lists", () => {
    wrapper = mount(MfaStep, { props: { methods: ["email", "recovery"] } });

    expect(wrapper.find("h2").text()).toBe("E-mail code");
    expect(wrapper.find(".mfa__others").exists()).toBe(false);
  });
});
