import { describe, expect, it } from "vitest";
import { renderMarkdown } from "@/scripts/pastebin/markdown";

describe("renderMarkdown", () => {
  it("renders Markdown to HTML", () => {
    expect(renderMarkdown("# Title\n\nSome **bold** text")).toBe(
      "<h1>Title</h1>\n<p>Some <strong>bold</strong> text</p>\n"
    );
  });

  it("keeps raw HTML as text", () => {
    expect(renderMarkdown("<script>alert(1)</script>")).toBe(
      "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>\n"
    );
  });

  it("doesn't link javascript: URLs", () => {
    expect(renderMarkdown("[click](javascript:alert(1))")).not.toContain("<a");
  });

  it("opens links in a new tab without a referrer", () => {
    expect(renderMarkdown("[site](https://vb2007.hu) and https://example.com")).toBe(
      '<p><a href="https://vb2007.hu" target="_blank" rel="nofollow noopener noreferrer">site</a> and ' +
        '<a href="https://example.com" target="_blank" rel="nofollow noopener noreferrer">https://example.com</a></p>\n'
    );
  });

  it("loads images lazily without a referrer", () => {
    expect(renderMarkdown("![logo](https://vb2007.hu/logo.png)")).toBe(
      '<p><img src="https://vb2007.hu/logo.png" alt="logo" loading="lazy" referrerpolicy="no-referrer"></p>\n'
    );
  });

  it("highlights fenced code by its language or alias", () => {
    expect(renderMarkdown("```py\ndef x(): pass\n```")).toContain(
      '<code class="language-py"><span class="hljs-keyword">def</span>'
    );
  });

  it("escapes fenced code in an unknown or missing language", () => {
    expect(renderMarkdown("```nope\n<b>\n```")).toBe(
      '<pre><code class="language-nope">&lt;b&gt;\n</code></pre>\n'
    );
    expect(renderMarkdown("```\n<i>\n```")).toBe("<pre><code>&lt;i&gt;\n</code></pre>\n");
  });
});
