import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import AdminRateLimits from "@/components/features/admin/AdminRateLimits.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import { Messages } from "@/constants/messages";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

const field = (wrapper: VueWrapper, label: string) =>
  wrapper.findAllComponents(BaseInput).find((input) => input.props("label") === label)!;

const cleared = (names: string[]) =>
  jsonResponse(200, { message: "Rate limits cleared.", cleared: names });

describe("AdminRateLimits", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("explains what an e-mail clears beyond the IP, and describes the e-mail with it", () => {
    const wrapper = mount(AdminRateLimits);

    expect(wrapper.find("h2").text()).toBe("Rate limits");
    const lead = wrapper.find(".lead");
    expect(lead.text()).toContain("Giving an address also lifts its log-in lockout from every IP");
    expect(lead.text()).toContain(
      "its account's limits and daily wrong-code caps, and those of a sign-up waiting for it"
    );
    expect(lead.text()).toContain("an IP alone leaves them");
    expect(field(wrapper, "IP address").props("hint")).toContain(
      "An IPv6 address clears its whole network block"
    );
    expect(field(wrapper, "E-mail").find("input").attributes("aria-describedby")).toBe(
      lead.attributes("id")
    );
  });

  it("sends nothing without an e-mail or an IP, or with an IP that isn't one", async () => {
    const wrapper = mount(AdminRateLimits, { attachTo: document.body });

    expect(wrapper.find("button[type=submit]").attributes("aria-disabled")).toBe("true");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(field(wrapper, "E-mail").props("error")).toBe(Messages.Admin.rateLimitTargetMissing);
    expect(document.activeElement).toBe(field(wrapper, "E-mail").find("input").element);

    await field(wrapper, "IP address").find("input").setValue("localhost");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(field(wrapper, "E-mail").props("error")).toBe("");
    expect(field(wrapper, "IP address").props("error")).toBe(Messages.Admin.invalidIp);
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("checks each field once it was edited and left", async () => {
    const wrapper = mount(AdminRateLimits);
    const email = field(wrapper, "E-mail").find("input");
    const ip = field(wrapper, "IP address").find("input");

    await ip.setValue("203.0.113");
    expect(field(wrapper, "IP address").props("error")).toBeFalsy();
    await ip.trigger("blur");
    expect(field(wrapper, "IP address").props("error")).toBe(Messages.Admin.invalidIp);

    await ip.setValue("");
    await email.setValue("a");
    await email.setValue("");
    await email.trigger("blur");
    expect(field(wrapper, "E-mail").props("error")).toBe(Messages.Admin.rateLimitTargetMissing);
  });

  it("lists what it cleared, one limiter a line", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = mount(AdminRateLimits);

    await field(wrapper, "E-mail").find("input").setValue("anna@example.com");
    await field(wrapper, "IP address").find("input").setValue("203.0.113.7");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find("button[type=submit]").text()).toBe("Clearing");

    respond(cleared(["loginPerAccount", "loginPerEmail"]));
    await flushPromises();

    const notice = wrapper.find(".status--success");
    expect(notice.text()).toContain("Cleared for anna@example.com and 203.0.113.7:");
    expect(notice.findAll(".cleared__item").map((item) => item.text())).toEqual([
      "Failed log-ins to the address from the IP.",
      "Failed log-ins to the address from anywhere."
    ]);
    expect(wrapper.find("button[type=submit]").text()).toBe("Clear rate limits");
  });

  it("says so when nothing was counting", async () => {
    fetchMock.mockResolvedValueOnce(cleared([]));
    const wrapper = mount(AdminRateLimits);

    await field(wrapper, "IP address").find("input").setValue("::1");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".status--info").text()).toBe(
      "Nothing was counting for ::1, so there was nothing to clear."
    );
    expect(wrapper.find(".status--success").exists()).toBe(false);
  });

  it("shows the API's refusal above the key", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: "email must be a non-empty string." })
    );
    const wrapper = mount(AdminRateLimits);

    await field(wrapper, "E-mail").find("input").setValue("anna@example.com");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".status--error").text()).toBe("email must be a non-empty string.");
  });
});
