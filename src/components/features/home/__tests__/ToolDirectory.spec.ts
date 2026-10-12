import { describe, expect, it } from "vitest";
import ToolDirectory from "@/components/features/home/ToolDirectory.vue";
import StopMarker from "@/components/ui/StopMarker.vue";
import type { Stop } from "@/constants/stops";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const stops: Stop[] = [
  { id: "shorten", label: "Shorten", to: "/shorten", status: "open", blurb: "Short links." },
  { id: "paste", label: "Paste", to: "/pastebin", status: "open", blurb: "Snippets." },
  { id: "upload", label: "Upload", to: "/upload", status: "planned", blurb: "Files." }
];

describe("ToolDirectory", () => {
  it("lists every stop in order with its own description", async () => {
    const { wrapper } = await mountWithRouter(ToolDirectory, { props: { stops } });

    expect(wrapper.findAll(".sign__name").map((name) => name.text())).toEqual([
      "Shorten",
      "Paste",
      "Upload"
    ]);
    expect(wrapper.findAll(".sign__blurb").map((blurb) => blurb.text())).toEqual([
      "Short links.",
      "Snippets.",
      "Files."
    ]);
  });

  it("makes each open stop one link to its page", async () => {
    const { wrapper } = await mountWithRouter(ToolDirectory, { props: { stops } });
    const links = wrapper.findAll("a.sign");

    expect(links.map((link) => link.attributes("href"))).toEqual(["/shorten", "/pastebin"]);
    expect(links[0].text()).toContain("Shorten");
    expect(links[0].findComponent(StopMarker).props("status")).toBe("open");
  });

  it("marks planned stops without linking them", async () => {
    const { wrapper } = await mountWithRouter(ToolDirectory, { props: { stops } });
    const planned = wrapper.find(".sign--planned");

    expect(planned.element.tagName).toBe("DIV");
    expect(planned.find(".sign__chip").text()).toBe("Planned");
    expect(planned.findComponent(StopMarker).props("status")).toBe("planned");
    expect(wrapper.findAll(".sign__chip")).toHaveLength(1);
  });
});
