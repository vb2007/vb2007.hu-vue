import MarkdownIt from "markdown-it";
import { hljs } from "./highlight";

/**
 * Markdown for pastes. Raw HTML stays text (`html: false`) and markdown-it drops `javascript:` and
 * similar links on its own, so the output is safe for v-html.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  // Fences take highlight.js names and aliases (js, py, sh); anything else is shown as plain text.
  highlight: (code, info) => {
    const language = info.trim().split(/\s+/, 1)[0];
    return hljs.getLanguage(language)
      ? hljs.highlight(code, { language, ignoreIllegals: true }).value
      : "";
  }
});

// Pastes are written by strangers: links leave the site in a new tab, and neither links nor images tell the target where they came from.
md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
  tokens[index].attrSet("target", "_blank");
  tokens[index].attrSet("rel", "nofollow noopener noreferrer");
  return self.renderToken(tokens, index, options);
};

const renderImage = md.renderer.rules.image!;
md.renderer.rules.image = (tokens, index, options, env, self) => {
  tokens[index].attrSet("loading", "lazy");
  tokens[index].attrSet("referrerpolicy", "no-referrer");
  return renderImage(tokens, index, options, env, self);
};

export const renderMarkdown = (content: string) => md.render(content);
