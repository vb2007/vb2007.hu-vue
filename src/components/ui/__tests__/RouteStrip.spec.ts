import { describe, expect, it } from "vitest";
import RouteStrip from "@/components/ui/RouteStrip.vue";
import type { Stop } from "@/constants/stops";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const stops: Stop[] = [
  { id: "home", label: "Home", to: "/", status: "open", blurb: "" },
  { id: "shorten", label: "Shorten", to: "/shorten", status: "open", blurb: "" },
  { id: "paste", label: "Paste", to: "/pastebin", status: "planned", blurb: "" }
];

describe("RouteStrip", () => {
  it("links open stops and marks the current one", async () => {
    const { wrapper } = await mountWithRouter(
      RouteStrip,
      { props: { stops, label: "Tools" } },
      "/shorten"
    );
    const links = wrapper.findAll("a");

    expect(wrapper.find("nav").attributes("aria-label")).toBe("Tools");
    expect(wrapper.find("ul").classes()).toContain("strip--horizontal");
    expect(links.map((link) => link.attributes("href"))).toEqual(["/", "/shorten"]);
    expect(links[0].find(".marker").classes()).not.toContain("marker--here");
    expect(links[1].find(".marker").classes()).toContain("marker--here");
  });

  it("shows planned stops without a link", async () => {
    const { wrapper } = await mountWithRouter(RouteStrip, { props: { stops, label: "Tools" } });
    const planned = wrapper.find(".strip__stop--planned");

    expect(planned.element.tagName).toBe("SPAN");
    expect(planned.attributes("title")).toBe("Paste: planned");
    expect(planned.text()).toContain("(planned)");
    expect(planned.find(".marker").classes()).toContain("marker--planned");
  });

  it("can be laid out vertically", async () => {
    const { wrapper } = await mountWithRouter(RouteStrip, {
      props: { stops, label: "Tools", orientation: "vertical" }
    });

    expect(wrapper.find("ul").classes()).toContain("strip--vertical");
  });

  it("emits navigate when a stop is clicked", async () => {
    const { wrapper } = await mountWithRouter(RouteStrip, { props: { stops, label: "Tools" } });

    await wrapper.findAll("a")[1].trigger("click");

    expect(wrapper.emitted("navigate")).toHaveLength(1);
  });
});
