import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
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

    // No answer (the lookup is never aborted: it passes no signal), or a server error: the API's
    // JSON 500, or a gateway's 502/504 page while the API is down. That page only arrives as a 502/504
    // when it carries CORS headers; otherwise the browser reports a network error, which ends here
    // too. Worth retrying either way.
    if (!result.ok && (result.kind !== "http" || result.status >= HttpStatus.InternalServerError)) {
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
      // Only a JSON `{ error }` below 500 is left here: in practice the API's 4xx for a code that
      // doesn't exist.
      state.value = "not-found";
      errorMessage.value = json.error;
    } else {
      // Neither a target nor the API's `{ error }`: a non-JSON answer from something in front of
      // the API, or a lookup without a target. The API's own redirect may still get there.
      go(apiUrl(Endpoints.ShortUrl.redirect, { params }));
    }
  };

  return { state, target, details, errorMessage, resolve };
};
