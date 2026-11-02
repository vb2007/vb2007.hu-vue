import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";

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
  if (content.trim().length < Limits.Paste.minLength) {
    return Messages.Pastebin.tooShort(Limits.Paste.minLength);
  }
  if (content.length > Limits.Paste.maxLength) {
    return Messages.Pastebin.tooLong(Limits.Paste.maxLength);
  }
  return "";
};
