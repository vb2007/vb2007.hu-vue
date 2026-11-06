import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SortSelect, { type SortOption } from "@/components/ui/SortSelect.vue";

const options: SortOption<"date" | "name">[] = [
  { by: "date", order: "desc", label: "Newest first" },
  { by: "date", order: "asc", label: "Oldest first" },
  { by: "name", order: "asc", label: "Name, A to Z" }
];

describe("SortSelect", () => {
  it("shows the current sort as one choice, labelled Sort", () => {
    const wrapper = mount(SortSelect, {
      props: { options, sortBy: "date", sortOrder: "asc" }
    });

    expect(wrapper.find("label").text()).toBe("Sort");
    expect(wrapper.findAll("option").map((option) => option.text())).toEqual([
      "Newest first",
      "Oldest first",
      "Name, A to Z"
    ]);
    expect(wrapper.find<HTMLSelectElement>("select").element.value).toBe("date:asc");
    expect(wrapper.classes()).toContain("field--md");
  });

  it("tells which field and direction was picked", async () => {
    const wrapper = mount(SortSelect, {
      props: { options, sortBy: "date", sortOrder: "desc", label: "Order", size: "sm" }
    });

    await wrapper.find("select").setValue("name:asc");

    expect(wrapper.emitted("change")).toEqual([["name", "asc"]]);
    expect(wrapper.find("label").text()).toBe("Order");
    expect(wrapper.classes()).toContain("field--sm");
  });
});
