import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { validateUrl } from "@/scripts/utility/text";

/**
 * Why a URL isn't sent to be shortened, or "" when it is: a scheme the API doesn't take, then a URL
 * over the API's length limit, in the order the API checks them. The API also refuses a URL with
 * whitespace, which isn't checked here, so that one is still sent and refused.
 */
export const validateShortUrl = (url: string) => {
  if (!validateUrl(url)) return Messages.ShortUrl.invalidUrl;
  if (url.length > Limits.ShortUrl.maxLength) {
    return Messages.ShortUrl.tooLong(url.length, Limits.ShortUrl.maxLength);
  }
  return "";
};
