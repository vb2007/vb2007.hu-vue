import { describe, expect, it } from "vitest";
import RouteMap from "@/components/features/home/RouteMap.vue";
import type { Line } from "@/constants/stops";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const line: Line = {
  id: "test",
  name: "Test",
  stops: [
    { id: "home", label: "Home", to: "/", status: "open", blurb: "Start here." },
    { id: "shorten", label: "Shorten", to: "/shorten", status: "open", blurb: "Short links." },
    { id: "paste", label: "Paste", to: "/pastebin", status: "planned", blurb: "Snippets." },
    { id: "upload", label: "Upload", to: "/upload", status: "planned", blurb: "Files." }
  ]
};

const mountMap = (props: { hereId?: string; initialId?: string } = {}) =>
  mountWithRouter(RouteMap, { props: { line, ...props } });

const stopButtons = async (props?: Parameters<typeof mountMap>[0]) => {
  const { wrapper } = await mountMap(props);
  return { wrapper, buttons: wrapper.findAll(".stop__button") };
};

describe("RouteMap", () => {
  it("names the line and starts on the first stop", async () => {
    const { wrapper } = await mountMap();

    expect(wrapper.find(".map__line").text()).toBe("Test line");
    expect(wrapper.find(".detail__title").text()).toBe("Home");
    expect(wrapper.find(".detail__go").attributes("href")).toBe("/");
  });

  it("starts on the requested stop and explains planned stops", async () => {
    const { wrapper, buttons } = await stopButtons({ initialId: "paste" });

    expect(buttons[2].attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".detail__title").text()).toBe("Paste");
    expect(wrapper.find(".detail__text").text()).toMatch(
      /^Snippets\.\s+Not\u00a0built\u00a0yet\.$/
    );
    expect(wrapper.find(".detail__go").exists()).toBe(false);
  });

  it("labels the stops", async () => {
    const { buttons } = await stopButtons({ hereId: "home" });

    expect(buttons.map((button) => button.find(".stop__chip").text())).toEqual([
      "You are here",
      "Open",
      "Planned",
      "Planned"
    ]);
    expect(buttons[0].find(".marker").classes()).toContain("marker--here");
  });

  it("does not offer a link to the stop you are already at", async () => {
    const { wrapper } = await mountMap({ hereId: "home" });

    expect(wrapper.find(".detail__title").text()).toBe("Home");
    expect(wrapper.find(".detail__go").exists()).toBe(false);
  });

  it.each(["click", "mouseenter", "focus"])("switches the detail on %s", async (event) => {
    const { wrapper, buttons } = await stopButtons({ hereId: "home" });

    await buttons[1].trigger(event);

    expect(buttons[1].attributes("aria-pressed")).toBe("true");
    expect(wrapper.find(".detail__text").text()).toBe("Short links.");
    expect(wrapper.find(".detail__go").text()).toBe("Go to Shorten");
    expect(wrapper.find(".detail__go").attributes("href")).toBe("/shorten");
  });

  it("puts planned stops on the lower track after the bend", async () => {
    const { wrapper } = await mountMap();
    const stops = wrapper.findAll("li.stop").map((stop) => stop.classes());

    expect(stops[0]).toContain("stop--upper");
    expect(stops[1]).toEqual(expect.arrayContaining(["stop--upper", "stop--before-bend"]));
    expect(stops[2]).toEqual(expect.arrayContaining(["stop--lower", "stop--first-lower"]));
    expect(stops[3]).toEqual(expect.arrayContaining(["stop--lower", "stop--last"]));
  });
});
