import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { validateUrl } from "@/scripts/utility/text";

/** Whether `url` has whitespace, like the API's `containsWhitespace`: a space, tab or line break. */
export const containsWhitespace = (url: string) => /\s/.test(url);

/**
 * Why a URL isn't sent to be shortened, or "" when it is, in the order the API checks: a scheme it
 * doesn't take or whitespace (one check there, with one error), then a URL over its length limit.
 * Whitespace gets its own text, since a space at either end is easy to miss, so a URL that only
 * starts with one names the space rather than the format. Like the API, nothing is trimmed.
 */
export const validateShortUrl = (url: string) => {
  if (!validateUrl(url.trimStart())) return Messages.ShortUrl.invalidUrl;
  if (containsWhitespace(url)) return Messages.ShortUrl.containsWhitespace;
  if (url.length > Limits.ShortUrl.maxLength) {
    return Messages.ShortUrl.tooLong(url.length, Limits.ShortUrl.maxLength);
  }
  return "";
};
