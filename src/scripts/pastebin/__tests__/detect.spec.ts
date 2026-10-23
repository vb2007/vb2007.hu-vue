import { describe, expect, it } from "vitest";
import { detectLanguage } from "@/scripts/pastebin/detect";
import { DETECT_SAMPLES } from "./detectSamples";

describe("detectLanguage", () => {
  it.each(DETECT_SAMPLES)("reads %s as %s", (_name, language, content) => {
    expect(detectLanguage(content)).toBe(language);
  });

  it.each([
    ["#!/usr/bin/env python3\nprint('hi')", "python"],
    ["#!/usr/bin/env node\nconsole.log(1)", "javascript"],
    ["#!/usr/bin/ruby\nputs 1", "ruby"],
    ["#!/usr/bin/php\n<?php echo 1;", "php"],
    ["#!/usr/bin/lua\nprint(1)", "lua"],
    ["#!/usr/bin/pwsh\nWrite-Host 1", "powershell"]
  ])("follows the shebang in %j", (content, language) => {
    expect(detectLanguage(content)).toBe(language);
  });

  it("ignores a shebang it doesn't know and looks at the code", () => {
    expect(detectLanguage("#!/usr/bin/awk -f\nhello there")).toBe("plaintext");
  });

  it("only calls it JSON when it parses", () => {
    expect(detectLanguage('[1, 2, "three"]')).toBe("json");
    expect(detectLanguage("{ not json at all }")).not.toBe("json");
  });

  it.each(["", " ", "a", "\n\n"])("calls %j plain text", (content) => {
    expect(detectLanguage(content)).toBe("plaintext");
  });

  it("calls two kinds of Markdown syntax in plain prose Markdown", () => {
    expect(detectLanguage("# Shopping\n\n- milk\n- bread")).toBe("markdown");
  });

  it("only looks at the start of a long paste", () => {
    const python = DETECT_SAMPLES.find(([, language]) => language === "python")![2];
    expect(detectLanguage(`${python}\n${"x = 1\n".repeat(2000)}`)).toBe("python");
  });
});
