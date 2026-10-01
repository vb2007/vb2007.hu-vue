import { ref } from "vue";
import { validateUrl } from "@/scripts/utility/text";
import { UrlShortening } from "@/constants/api";

/** State and request logic for shortening a URL. Shared by Home and Shorten. */
export const useShortener = () => {
  const originalUrl = ref("");
  const shortenedCode = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");

  const shortenedLink = () =>
    shortenedCode.value ? UrlShortening.redirect + shortenedCode.value : "";

  const shorten = async () => {
    if (!validateUrl(originalUrl.value)) {
      errorMessage.value = "Invalid URL / URI format.";
      return;
    }

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(UrlShortening.shortenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          url: originalUrl.value
        }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        shortenedCode.value = data.data.shortenedUrl;
        originalUrl.value = "";
      } else {
        errorMessage.value = `Failed to shorten URL: ${response.statusText}`;
        console.error("Failed to shorten url: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error shortening url: ", error);
    } finally {
      isLoading.value = false;
    }
  };

  const reset = () => {
    shortenedCode.value = "";
    errorMessage.value = "";
  };

  return { originalUrl, shortenedCode, shortenedLink, isLoading, errorMessage, shorten, reset };
};
