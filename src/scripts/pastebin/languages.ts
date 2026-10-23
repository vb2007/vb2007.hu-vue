/** A language a paste can be shown in. The id is highlight.js's name, which the API stores as is. */
export interface PasteLanguage {
  id: string;
  label: string;
}

export const PLAINTEXT = "plaintext";
export const MARKDOWN = "markdown";

/** Plain text and Markdown first, then code languages A to Z. */
export const PASTE_LANGUAGES: PasteLanguage[] = [
  { id: PLAINTEXT, label: "Plain text" },
  { id: MARKDOWN, label: "Markdown" },
  { id: "bash", label: "Bash" },
  { id: "c", label: "C" },
  { id: "cpp", label: "C++" },
  { id: "csharp", label: "C#" },
  { id: "css", label: "CSS" },
  { id: "diff", label: "Diff" },
  { id: "dockerfile", label: "Dockerfile" },
  { id: "go", label: "Go" },
  { id: "xml", label: "HTML / XML" },
  { id: "ini", label: "INI / TOML" },
  { id: "java", label: "Java" },
  { id: "javascript", label: "JavaScript" },
  { id: "json", label: "JSON" },
  { id: "kotlin", label: "Kotlin" },
  { id: "lua", label: "Lua" },
  { id: "nginx", label: "Nginx" },
  { id: "php", label: "PHP" },
  { id: "powershell", label: "PowerShell" },
  { id: "python", label: "Python" },
  { id: "ruby", label: "Ruby" },
  { id: "rust", label: "Rust" },
  { id: "sql", label: "SQL" },
  { id: "swift", label: "Swift" },
  { id: "typescript", label: "TypeScript" },
  { id: "yaml", label: "YAML" }
];

export const isKnownLanguage = (id: string | undefined): id is string =>
  PASTE_LANGUAGES.some((language) => language.id === id);

/** The language's display name; unknown ids read as plain text. */
export const languageLabel = (id: string) =>
  PASTE_LANGUAGES.find((language) => language.id === id)?.label ?? "Plain text";
