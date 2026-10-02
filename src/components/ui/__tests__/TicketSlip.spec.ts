import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import TicketSlip from "@/components/ui/TicketSlip.vue";
import AppIcon from "@/components/ui/AppIcon.vue";

const value = "https://api.test/r/abc123";

describe("TicketSlip", () => {
  it("links to the short URL", () => {
    const wrapper = mount(TicketSlip, { props: { value } });
    const link = wrapper.find("a");

    expect(link.attributes()).toMatchObject({ href: value, target: "_blank", rel: "noopener" });
    expect(link.text()).toBe(value);
  });

  it("copies the link and confirms it", async () => {
    const wrapper = mount(TicketSlip, { props: { value } });
    const copyButton = wrapper.findAll("button")[0];
    expect(copyButton.text()).toBe("Copy link");

    await copyButton.trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(value);
    expect(copyButton.text()).toBe("Copied");
    expect(copyButton.findComponent(AppIcon).props("name")).toBe("check");
    expect(wrapper.find('[role="status"]').text()).toBe("Link copied to clipboard");
  });

  it("says so when copying fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    const wrapper = mount(TicketSlip, { props: { value } });
    const copyButton = wrapper.findAll("button")[0];

    await copyButton.trigger("click");
    await flushPromises();

    expect(copyButton.text()).toBe("Copy failed");
    expect(copyButton.findComponent(AppIcon).props("name")).toBe("copy");
    expect(wrapper.find('[role="status"]').text()).toBe("");
  });

  it("emits again when the user wants another link", async () => {
    const wrapper = mount(TicketSlip, { props: { value } });

    await wrapper.findAll("button")[1].trigger("click");

    expect(wrapper.emitted("again")).toHaveLength(1);
  });
});
