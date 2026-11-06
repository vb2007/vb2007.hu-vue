import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { validateShortUrl } from "@/scripts/shorten/shortUrl";

export const shortLink = (code: string) => `${window.location.origin}/r/${code}`;

/** State and request logic for shortening a URL. Shared by Home and Shorten. */
export const useShortener = () => {
  const originalUrl = ref("");
  const shortenedCode = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");

  /** Short links live on this site (/r/:code), which is shorter than going through the API host. */
  const shortenedLink = () => (shortenedCode.value ? shortLink(shortenedCode.value) : "");

  /** Whether the API gave back a link: a new one, or the user's own for the same URL. */
  const shorten = async () => {
    const invalid = validateShortUrl(originalUrl.value);
    if (invalid) {
      errorMessage.value = invalid;
      return false;
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
    return result.ok;
  };

  const reset = () => {
    shortenedCode.value = "";
    errorMessage.value = "";
  };

  return { originalUrl, shortenedCode, shortenedLink, isLoading, errorMessage, shorten, reset };
};
