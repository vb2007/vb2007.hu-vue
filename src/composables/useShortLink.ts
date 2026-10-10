import { ref } from "vue";
import { UrlShortening } from "@/constants/api";
import { isSafeRedirect } from "@/scripts/utility/text";

export type ShortLinkState = "resolving" | "redirecting" | "not-found" | "unsafe" | "error";

/**
 * Resolves a short code through the API, then sends the browser on to its target.
 * `navigate` is only swapped out by tests; jsdom can't follow a real navigation.
 */
export const useShortLink = (navigate = (url: string) => window.location.replace(url)) => {
  const state = ref<ShortLinkState>("resolving");
  const target = ref("");
  const errorMessage = ref("");

  const resolve = async (code: string) => {
    const apiRedirect = UrlShortening.redirect + encodeURIComponent(code);
    state.value = "resolving";
    target.value = "";
    errorMessage.value = "";

    try {
      const response = await fetch(
        UrlShortening.lookup.replace(":shortenedUrl", encodeURIComponent(code)),
        { method: "GET" }
      );

      let data: { originalUrl?: string; error?: string } | undefined;
      try {
        data = await response.json();
      } catch {
        // Not JSON: an API without the lookup endpoint yet. Its own redirect still works.
      }

      if (response.ok && data?.originalUrl) {
        if (!isSafeRedirect(data.originalUrl)) {
          state.value = "unsafe";
          return;
        }
        target.value = data.originalUrl;
        state.value = "redirecting";
        navigate(data.originalUrl);
      } else if (data?.error) {
        state.value = "not-found";
        errorMessage.value = data.error;
      } else {
        target.value = apiRedirect;
        state.value = "redirecting";
        navigate(apiRedirect);
      }
    } catch (error) {
      state.value = "error";
      errorMessage.value = "Error connecting to server";
      console.error("Error resolving short link: ", error);
    }
  };

  return { state, target, errorMessage, resolve };
};
