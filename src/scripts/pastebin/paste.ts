/** The API's paste length limits, checked here before sending. */
export const PASTE_MIN_LENGTH = 2;
export const PASTE_MAX_LENGTH = 10000;

export type SortOrder = "asc" | "desc";

export interface Paste {
  _id: string;
  content: string;
  /** Only the listing populates the author; a single paste carries just the user ID. */
  addedBy: string | { _id: string; username: string };
  addedOn: string;
  /** A PASTE_LANGUAGES id (vb2007/vb2007.hu-api#123); pastes from before it have none. */
  language?: string;
}

export interface Pagination {
  limit: number;
  page: number;
  total: number;
  pages: number;
  sortBy: string;
  sortOrder: SortOrder;
}

/** A paste's shareable page on this site (not the API). */
export const pasteLink = (id: string) => `${window.location.origin}/pastebin/${id}`;

/** The first non-empty line, for one-line previews. */
export const pastePreview = (content: string) => content.trim().split("\n")[0];

/** Line and character counts, so similar pastes can be told apart, e.g. "3 lines · 120 characters". */
export const pasteSize = (content: string) => {
  const lines = content.split("\n").length;
  const chars = content.length;
  return `${lines} ${lines === 1 ? "line" : "lines"} · ${chars} ${chars === 1 ? "character" : "characters"}`;
};

/** Returns why a paste can't be sent, or "" when it can. */
export const validatePaste = (content: string) => {
  if (content.trim().length < PASTE_MIN_LENGTH) {
    return `A paste needs at least ${PASTE_MIN_LENGTH} characters.`;
  }
  if (content.length > PASTE_MAX_LENGTH) {
    return `A paste can be at most ${PASTE_MAX_LENGTH} characters.`;
  }
  return "";
};

/** The API's `{ error }` message when it sent one, otherwise `fallback` with the status text. */
export const errorFrom = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    if (data.error) {
      return data.error as string;
    }
  } catch {
    // Not JSON (e.g. a bare 500); the status text below is all there is.
  }
  return `${fallback}: ${response.statusText || response.status}`;
};
