import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import UploadLink from "@/components/features/uploads/UploadLink.vue";
import { linkParts } from "@/scripts/uploads/upload";

describe("UploadLink", () => {
  it("shows the link without the protocol, the file part kept apart", () => {
    const url = "https://cdn.test/useruploads/u1/abc.png";
    const wrapper = mount(UploadLink, { props: { url } });

    expect(wrapper.attributes("title")).toBe(url);
    expect(wrapper.find(".link__head").text()).toBe("cdn.test/useruploads/u1/");
    expect(wrapper.find(".link__tail").text()).toBe("abc.png");
  });

  it("shortens a long file name in the middle and keeps the extension", () => {
    expect(linkParts("https://cdn.test/u/671234567890abcdefa3f1.png").tail).toBe("6712…a3f1.png");
    expect(linkParts("https://cdn.test/u/671234567890abcdefa3f1").tail).toBe("6712…a3f1");
  });

  it("splits a link without folders or protocol too", () => {
    expect(linkParts("http://cdn.test/a.png")).toEqual({ head: "cdn.test/", tail: "a.png" });
    expect(linkParts("a.png")).toEqual({ head: "", tail: "a.png" });
  });
});
