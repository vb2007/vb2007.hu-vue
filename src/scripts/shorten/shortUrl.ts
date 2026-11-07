import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { validateUrl } from "@/scripts/utility/text";

/** Whitespace as the API's `containsWhitespace` finds it (`\s`): no-break spaces, tabs and more. */
const WHITESPACE = /\s/;

/**
 * Why a URL isn't sent to be shortened, or "" when it is, in the order the API checks: a scheme it
 * doesn't take or whitespace (one check there, with one error), then a URL over its length limit.
 * Whitespace gets its own texts, by where it is, since at the start or end it can't be seen. The
 * URL is sent as typed, never trimmed: the scheme check only skips leading whitespace to pick the
 * message, so a URL that merely starts with a space names the space rather than the format.
 */
export const validateShortUrl = (url: string) => {
  if (!validateUrl(url.trimStart())) return Messages.ShortUrl.invalidUrl;
  const trimmed = url.trim();
  if (WHITESPACE.test(trimmed)) return Messages.ShortUrl.innerWhitespace;
  if (trimmed !== url) return Messages.ShortUrl.edgeWhitespace;
  if (url.length > Limits.ShortUrl.maxLength) {
    return Messages.ShortUrl.tooLong(url.length, Limits.ShortUrl.maxLength);
  }
  return "";
};

/**
 * What `validateShortUrl` names while the URL is still being typed, since typing on can't fix it:
 * a URL over the limit (in the API's order, so one without a scheme names the format), and
 * whitespace before the end of one with a scheme. The format otherwise, and whitespace at the end,
 * which the next key may turn into the middle of the URL, wait until the field is left.
 */
export const validateShortUrlWhileTyping = (url: string) => {
  if (url.length > Limits.ShortUrl.maxLength) return validateShortUrl(url);
  if (!validateUrl(url.trimStart()) || !WHITESPACE.test(url.trimEnd())) return "";
  return validateShortUrl(url);
};
