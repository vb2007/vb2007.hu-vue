import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UsageMeter from "@/components/features/uploads/UsageMeter.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { someUsage } from "@/__tests__/helpers/uploads";

const MB = 1024 * 1024;
const mountMeter = (usage = someUsage(), errorMessage = "") =>
  mount(UsageMeter, { props: { usage, errorMessage } });

describe("UsageMeter", () => {
  it("says it's loading until usage arrives", () => {
    const wrapper = mount(UsageMeter, { props: { usage: null, errorMessage: "" } });

    expect(wrapper.find("h2").text()).toBe("Storage");
    expect(wrapper.find(".note").text()).toBe("Loading your storage…");
    expect(wrapper.find(".gauge").exists()).toBe(false);
  });

  it("shows the error instead", () => {
    const wrapper = mount(UsageMeter, { props: { usage: null, errorMessage: "Nope." } });

    expect(wrapper.findComponent(StatusMessage).text()).toBe("Nope.");
    expect(wrapper.find(".note").exists()).toBe(false);
  });

  it("draws used of quota as a meter, with what's left", () => {
    const wrapper = mountMeter();
    const meter = wrapper.find("[role=meter]");

    expect(wrapper.find(".gauge__figure").text()).toBe("5 MB of 100 MB used");
    expect(meter.attributes()).toMatchObject({
      "aria-valuemax": String(100 * MB),
      "aria-valuenow": String(5 * MB),
      "aria-valuetext": "5 MB of 100 MB",
      style: "--share: 0.05;"
    });
    expect(meter.classes()).toContain("gauge__line--some");
    expect(wrapper.find(".gauge__scale").text()).toBe("5%95 MB left");
    expect(wrapper.findComponent(StatusMessage).exists()).toBe(false);
  });

  it("splits the use by type, dimming the empty ones", () => {
    const wrapper = mountMeter();
    const rows = wrapper.findAll(".split__row");

    expect(rows.map((row) => row.find(".split__name").text())).toEqual([
      "Images",
      "Videos",
      "Audio",
      "Documents",
      "Archives"
    ]);
    expect(rows[0].find(".split__count").text()).toBe("1 file");
    expect(rows[0].find(".split__bytes").text()).toBe("4 MB");
    expect(rows[0].attributes("style")).toBe("--part: 0.8;");
    expect(rows[1].classes()).toContain("split__row--empty");
    expect(rows[1].find(".split__count").text()).toBe("0 files");
  });

  it("marks a tiny share as under 0.1% and an empty one as 0%", () => {
    const tiny = mountMeter(someUsage({ usedBytes: 1, byCategory: [] }));
    expect(tiny.find(".gauge__scale").text()).toMatch(/^<0\.1%/);

    const empty = mountMeter(
      someUsage({ usedBytes: 0, byCategory: [{ category: "image", bytes: 0, count: 0 }] })
    );
    expect(empty.find(".gauge__scale").text()).toMatch(/^0%/);
    expect(empty.find("[role=meter]").classes()).not.toContain("gauge__line--some");
    expect(empty.find(".split__row").attributes("style")).toBe("--part: 0;");
  });

  it("warns when the storage is almost full, and when it's full", () => {
    const almost = mountMeter(someUsage({ usedBytes: 95 * MB }));
    expect(almost.findComponent(StatusMessage).props("tone")).toBe("info");
    expect(almost.findComponent(StatusMessage).text()).toBe(
      "Your storage is almost full: 5 MB left."
    );

    const full = mountMeter(someUsage({ usedBytes: 120 * MB }));
    expect(full.findComponent(StatusMessage).props("tone")).toBe("error");
    expect(full.find(".gauge__scale").text()).toBe("100%0 bytes left");
    expect(full.find(".gauge__stop--to").classes()).toContain("gauge__stop--full");
  });
});
