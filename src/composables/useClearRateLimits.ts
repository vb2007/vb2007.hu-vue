import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { rateLimitBody, rateLimitTarget } from "@/scripts/admin/rateLimits";

/** What a clear did: who it was for, and the plain names of the limiters it emptied. */
export interface ClearedRateLimits {
  target: string;
  cleared: string[];
}

/** Clears the API's rate-limit counters of an e-mail address, an IP or both. */
export const useClearRateLimits = () => {
  const isClearing = ref(false);
  const clearError = ref("");
  /** The last clear that worked, until the next one starts. */
  const outcome = ref<ClearedRateLimits | null>(null);

  /** Returns whether it worked. */
  const clear = async (email: string, ip: string) => {
    isClearing.value = true;
    clearError.value = "";
    outcome.value = null;

    const body = rateLimitBody(email, ip);
    const result = await apiRequest(Endpoints.Admin.clearRateLimits, {
      body,
      failure: Messages.Admin.clearRateLimitsFailed
    });

    if (result.ok) {
      outcome.value = {
        target: rateLimitTarget(body),
        cleared: result.data.cleared.map(Messages.Admin.rateLimitName)
      };
    } else {
      clearError.value = result.error;
    }
    isClearing.value = false;
    return result.ok;
  };

  return { isClearing, clearError, outcome, clear };
};
