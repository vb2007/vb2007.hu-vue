import { hljs } from "./highlight";
import { MARKDOWN, PASTE_LANGUAGES, PLAINTEXT } from "./languages";

/** Below this, highlight.js is guessing (prose scores 0 to 5, real code 8 and up). */
const MIN_RELEVANCE = 6;
/** highlight.js tries every grammar in turn, so only look at the start of long pastes. */
const SAMPLE_LENGTH = 4000;

/** Markdown and plain text are decided by the rules below; highlight.js picks among the rest. */
const CODE_LANGUAGES = PASTE_LANGUAGES.map((language) => language.id).filter(
  (id) => id !== MARKDOWN && id !== PLAINTEXT
);

const SHEBANGS: [RegExp, string][] = [
  [/\b(bash|sh|zsh)\b/, "bash"],
  [/\bpython/, "python"],
  [/\bnode\b/, "javascript"],
  [/\bruby\b/, "ruby"],
  [/\bphp\b/, "php"],
  [/\blua\b/, "lua"],
  [/\bpwsh\b/, "powershell"]
];

/** What a line of Markdown can look like. A fence, a real link or a table is rare outside Markdown. */
const MARKDOWN_SIGNALS: [kind: string, pattern: RegExp, strong: boolean][] = [
  ["fence", /^\s*(```|~~~)/, true],
  ["link", /!?\[[^\]\n]+\]\((https?:\/\/|\/|\.\/|#|mailto:)[^)\s]*\)/, true],
  ["table", /^\s*\|?\s*:?-{3,}:?\s*\|/, true],
  ["heading", /^#{1,6}\s+\S/, false],
  ["quote", /^>\s/, false],
  ["list", /^\s*([-*+]|\d+[.)])\s+\S/, false],
  ["emphasis", /(^|[\s(])\*\*[^*\s]([^*\n]*[^*\s])?\*\*(?=[\s.,;:!?)]|$)/, false],
  ["code", /`[^`\n]+`/, false]
];

/** Which kinds of Markdown syntax the paste uses, and whether one of them is a strong sign. */
const markdownSignals = (content: string) => {
  const kinds = new Set<string>();
  let strong = false;
  for (const line of content.split("\n")) {
    for (const [kind, pattern, isStrong] of MARKDOWN_SIGNALS) {
      if (pattern.test(line)) {
        kinds.add(kind);
        strong ||= isStrong;
      }
    }
  }
  return { kinds: kinds.size, strong };
};

const isJson = (content: string) => {
  if (!/^[[{]/.test(content)) return false;
  try {
    JSON.parse(content);
    return true;
  } catch {
    return false;
  }
};

const fromShebang = (firstLine: string) => {
  if (!firstLine.startsWith("#!")) return undefined;
  return SHEBANGS.find(([pattern]) => pattern.test(firstLine))?.[1];
};

/** highlight.js mixes up a few look-alikes; these settle them by what only one of the pair has. */
const LOOK_ALIKES: [detected: string, actual: string, isActual: (text: string) => boolean][] = [
  // C has no `::`, classes, namespaces or extension-less standard headers.
  [
    "cpp",
    "c",
    (text) =>
      !/::|\b(class|namespace|template|public:|private:|new|delete)\b|#include\s*<\w+>/.test(text)
  ],
  // Python opens blocks with a colon; Ruby never ends a def or class line with one.
  ["ruby", "python", (text) => /^\s*(def|class|if|for|while|with)\b[^\n]*:\s*$/m.test(text)]
];

/** The likely language of a paste, as one of PASTE_LANGUAGES' ids. */
export const detectLanguage = (content: string): string => {
  const text = content.trim();
  if (text.length < 2) return PLAINTEXT;
  if (isJson(text)) return "json";

  const shebang = fromShebang(text.split("\n", 1)[0]);
  if (shebang) return shebang;

  const markdown = markdownSignals(text);
  if (markdown.strong || markdown.kinds >= 3) return MARKDOWN;

  const code = hljs.highlightAuto(text.slice(0, SAMPLE_LENGTH), CODE_LANGUAGES);
  if (code.relevance < MIN_RELEVANCE || !code.language) {
    // Two kinds of Markdown syntax in something that isn't code, e.g. headings and lists.
    return markdown.kinds >= 2 ? MARKDOWN : PLAINTEXT;
  }
  const lookAlike = LOOK_ALIKES.find(
    ([detected, , isActual]) => detected === code.language && isActual(text)
  );
  return lookAlike?.[1] ?? code.language;
};
