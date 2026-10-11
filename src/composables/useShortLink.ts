import { ref } from "vue";
import { UrlShortening } from "@/constants/api";
import { isSafeRedirect } from "@/scripts/utility/text";

export type ShortLinkState =
  | "resolving"
  | "redirecting"
  | "previewing"
  | "not-found"
  | "unsafe"
  | "error";

/** Who shared a short link and when; the lookup leaves these out on older APIs. */
export type ShortLinkDetails = {
  addedBy?: string;
  addedOn?: string;
};

type LookupResponse = {
  originalUrl?: string;
  addedBy?: { username?: string } | null;
  addedOn?: string;
  error?: string;
};

/**
 * Resolves a short code through the API, then sends the browser on to its target,
 * or, when previewing, stops and shows where it leads.
 * `navigate` is only swapped out by tests; jsdom can't follow a real navigation.
 */
export const useShortLink = (navigate = (url: string) => window.location.replace(url)) => {
  const state = ref<ShortLinkState>("resolving");
  const target = ref("");
  const details = ref<ShortLinkDetails>({});
  const errorMessage = ref("");

  const resolve = async (code: string, preview = false) => {
    const apiRedirect = UrlShortening.redirect + encodeURIComponent(code);
    state.value = "resolving";
    target.value = "";
    details.value = {};
    errorMessage.value = "";

    const go = (url: string) => {
      target.value = url;
      if (preview) {
        state.value = "previewing";
      } else {
        state.value = "redirecting";
        navigate(url);
      }
    };

    try {
      const response = await fetch(
        UrlShortening.lookup.replace(":shortenedUrl", encodeURIComponent(code)),
        { method: "GET" }
      );

      let data: LookupResponse | undefined;
      try {
        data = await response.json();
      } catch {
        // Not JSON: an API without the lookup endpoint yet. Its own redirect still works.
      }

      if (response.ok && data?.originalUrl) {
        details.value = {
          addedBy: data.addedBy?.username || undefined,
          addedOn: data.addedOn || undefined
        };
        if (!isSafeRedirect(data.originalUrl)) {
          state.value = "unsafe";
          return;
        }
        go(data.originalUrl);
      } else if (data?.error) {
        state.value = "not-found";
        errorMessage.value = data.error;
      } else {
        go(apiRedirect);
      }
    } catch (error) {
      state.value = "error";
      errorMessage.value = "Error connecting to server";
      console.error("Error resolving short link: ", error);
    }
  };

  return { state, target, details, errorMessage, resolve };
};
