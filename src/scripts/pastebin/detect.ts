import { hljs } from "./highlight";
import { MARKDOWN, PASTE_LANGUAGES, PLAINTEXT } from "./languages";

/** Below this it's a guess: prose scores 0 to 5, code 8 and up, or 6 with a single fingerprint. */
const MIN_SCORE = 6;
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

/**
 * Telltale lines per language. highlight.js alone scores short snippets as low as prose, so each
 * fingerprint a paste matches adds FINGERPRINT_BONUS to that language's score.
 */
const FINGERPRINTS: Record<string, RegExp[]> = {
  bash: [/^\s*(sudo|apt(-get)?|echo|export|cd|mkdir|chmod|chown|grep|curl|wget|systemctl) /m],
  c: [/#include\s*<\w+\.h>/, /\b(printf|malloc|free)\(/],
  cpp: [/\bstd::/, /#include\s*<\w+>/],
  csharp: [/^\s*using System\b/m, /\bConsole\.Write(Line)?\(/],
  css: [
    /^\s*[\w.#:[\]="-]+(\s*[,>+~ ]\s*[\w.#:[\]="-]+)*\s*\{\s*$/m,
    /^\s*[\w-]+:\s*[^;{}]+;\s*$/m
  ],
  diff: [/^(---|\+\+\+) \S/m, /^@@ -\d+(,\d+)? \+\d+/m],
  dockerfile: [/^FROM \S+( AS \w+)?\s*$/im, /^(RUN|COPY|WORKDIR|ENTRYPOINT|CMD|EXPOSE) /m],
  go: [/^package \w+\s*$/m, /\bfunc (\(\w+ \*?\w+\) )?\w+\(/, /\w+ := /],
  ini: [/^\[[\w.-]+\]\s*$/m],
  java: [/\bSystem\.out\.print/, /\bpublic static void main\(/],
  javascript: [/\bconsole\.\w+\(/, /\bdocument\.\w+/, /\(.*\)\s*=>/],
  kotlin: [/\bfun \w+\(/, /\bval \w+\s*[:=]/],
  lua: [/^\s*local \w+/m, /\bthen\s*$/m],
  nginx: [
    /^\s*(server|location|upstream)\b[^;]*\{\s*$/m,
    /^\s*(listen|server_name|proxy_pass|try_files)\s+[^;]+;/m
  ],
  php: [/<\?php/],
  powershell: [/\b(Get|Set|New|Remove|Write|Invoke)-[A-Z]\w+/],
  python: [
    /^\s*(def|class) \w+(\(.*\))?(\s*->\s*[^:]+)?:\s*$/m,
    /^\s*(if|elif|for|while|with|try|except)\b[^\n]*:\s*$/m,
    /^\s*print\(/m
  ],
  ruby: [/^\s*puts\b/m, /^\s*require ['"]/m, /\bdo \|\w+(, \w+)*\|/],
  rust: [/\bfn \w+\s*[(<]/, /\bprintln!\(/, /\blet mut\b/],
  sql: [/^\s*(SELECT|INSERT INTO|UPDATE|DELETE FROM|CREATE TABLE|ALTER TABLE|DROP TABLE)\b/im],
  swift: [/\bguard let\b/, /\bfunc \w+\(.*\)\s*(->|\{|async|throws)/],
  typescript: [/\binterface \w+/, /:\s*(string|number|boolean|void)\b/],
  xml: [/^\s*<(\?xml|!doctype|html\b|\w+[^>]*>)/im],
  yaml: [/^[\w-]+:\s*\n\s+[\w-]+:/m, /^\s*- [\w-]+:/m]
};
const FINGERPRINT_BONUS = 5;

/** highlight.js's relevance for a language (0 when the paste breaks its grammar), plus fingerprints. */
const scoreAs = (text: string, sample: string, language: string) => {
  const result = hljs.highlight(sample, { language, ignoreIllegals: false });
  const fingerprints = (FINGERPRINTS[language] ?? []).filter((pattern) => pattern.test(text));
  return (result.illegal ? 0 : result.relevance) + fingerprints.length * FINGERPRINT_BONUS;
};

/** The likely language of a paste, as one of PASTE_LANGUAGES' ids. */
export const detectLanguage = (content: string): string => {
  const text = content.trim();
  if (text.length < 2) return PLAINTEXT;
  if (isJson(text)) return "json";

  const shebang = fromShebang(text.split("\n", 1)[0]);
  if (shebang) return shebang;

  const markdown = markdownSignals(text);
  if (markdown.strong || markdown.kinds >= 3) return MARKDOWN;

  // Ties go to the language listed first, e.g. JavaScript over TypeScript and C over C++.
  const sample = text.slice(0, SAMPLE_LENGTH);
  let best = { language: PLAINTEXT, score: 0 };
  for (const language of CODE_LANGUAGES) {
    const score = scoreAs(text, sample, language);
    if (score > best.score) best = { language, score };
  }

  if (best.score < MIN_SCORE) {
    // Two kinds of Markdown syntax in something that isn't code, e.g. headings and lists.
    return markdown.kinds >= 2 ? MARKDOWN : PLAINTEXT;
  }
  return best.language;
};
