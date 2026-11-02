import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest, apiUrl } from "@/scripts/api/client";
import { isSafeRedirect } from "@/scripts/utility/text";
import type { ApiErrorBody } from "@/types/api/common";
import type { ShortUrlLookupResponse } from "@/types/api/shortener";

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

/** Whatever JSON the lookup answered, success or not. */
type LookupJson = (Partial<ShortUrlLookupResponse> & ApiErrorBody) | null;

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
    const params = { shortenedUrl: code };
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

    const result = await apiRequest(Endpoints.ShortUrl.lookup, {
      params,
      failure: Messages.ShortUrl.lookupFailed
    });

    // No answer (the lookup is never aborted: it passes no signal).
    if (!result.ok && result.kind !== "http") {
      state.value = "error";
      errorMessage.value = result.error;
      return;
    }

    // `body` is null when the answer wasn't JSON, even with a success status.
    const json: LookupJson = result.ok ? result.data : result.body;

    if (result.ok && json?.originalUrl) {
      details.value = {
        addedBy: json.addedBy?.username || undefined,
        addedOn: json.addedOn || undefined
      };
      if (!isSafeRedirect(json.originalUrl)) {
        state.value = "unsafe";
        return;
      }
      go(json.originalUrl);
    } else if (json?.error) {
      state.value = "not-found";
      errorMessage.value = json.error;
    } else {
      // Not JSON, or no target: an API without the lookup endpoint yet. Its own redirect still works.
      go(apiUrl(Endpoints.ShortUrl.redirect, { params }));
    }
  };

  return { state, target, details, errorMessage, resolve };
};
