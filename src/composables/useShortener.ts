import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { validateUrl } from "@/scripts/utility/text";

export const shortLink = (code: string) => `${window.location.origin}/r/${code}`;

/** Returns why the API would refuse to shorten a URL (checked in its order), or "" when it wouldn't. */
export const validateShortUrl = (url: string) => {
  if (!validateUrl(url)) return Messages.ShortUrl.invalidUrl;
  if (url.length > Limits.ShortUrl.maxLength) {
    return Messages.ShortUrl.tooLong(Limits.ShortUrl.maxLength);
  }
  return "";
};

/** State and request logic for shortening a URL. Shared by Home and Shorten. */
export const useShortener = () => {
  const originalUrl = ref("");
  const shortenedCode = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");

  /** Short links live on this site (/r/:code), which is shorter than going through the API host. */
  const shortenedLink = () => (shortenedCode.value ? shortLink(shortenedCode.value) : "");

  const shorten = async () => {
    const invalid = validateShortUrl(originalUrl.value);
    if (invalid) {
      errorMessage.value = invalid;
      return;
    }

    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.ShortUrl.create, {
      body: { url: originalUrl.value },
      failure: Messages.ShortUrl.shortenFailed
    });

    if (result.ok) {
      shortenedCode.value = result.data.data.shortenedUrl;
      originalUrl.value = "";
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  const reset = () => {
    shortenedCode.value = "";
    errorMessage.value = "";
  };

  return { originalUrl, shortenedCode, shortenedLink, isLoading, errorMessage, shorten, reset };
};
