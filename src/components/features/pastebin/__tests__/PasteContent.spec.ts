import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import PasteContent from "@/components/features/pastebin/PasteContent.vue";

describe("PasteContent", () => {
  it("highlights code in the given language", () => {
    const wrapper = mount(PasteContent, {
      props: { content: "def greet():\n    pass", language: "python" }
    });
    const code = wrapper.find(".sheet__content code");

    expect(code.attributes("data-language")).toBe("python");
    expect(code.find(".hljs-keyword").text()).toBe("def");
    expect(code.text()).toBe("def greet():\n    pass");
    expect(wrapper.find(".sheet__content").attributes("aria-label")).toBe("Paste content");
  });

  it("keeps markup in a paste as text", () => {
    const wrapper = mount(PasteContent, {
      props: { content: "<img src=x onerror=alert(1)>", language: "xml" }
    });

    expect(wrapper.find("img").exists()).toBe(false);
    expect(wrapper.find(".sheet__content").text()).toBe("<img src=x onerror=alert(1)>");
  });

  it("numbers the lines outside the copyable text", () => {
    const wrapper = mount(PasteContent, {
      props: { content: "a\nb\nc", language: "plaintext", numbered: true }
    });

    expect(wrapper.find(".sheet").classes()).toContain("sheet--numbered");
    expect(wrapper.find(".sheet__gutter").text()).toBe("1\n2\n3");
    expect(wrapper.find(".sheet__gutter").attributes("aria-hidden")).toBe("true");
  });

  it("renders Markdown as a page", () => {
    const wrapper = mount(PasteContent, {
      props: { content: "# Notes\n\n<b>raw</b>", language: "markdown", rendered: true }
    });
    const prose = wrapper.find("article.prose");

    expect(prose.attributes("aria-label")).toBe("Paste content");
    expect(prose.find("h1").text()).toBe("Notes");
    expect(prose.find("b").exists()).toBe(false);
    expect(wrapper.find(".sheet").exists()).toBe(false);
  });
});
