import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import type { UploadUsage } from "@/types/api/uploads";

/**
 * How much of their quota the user has used, and the upload rules the API enforces. Loading again
 * (e.g. after each upload) aborts a load still in flight, so an older answer can't land last.
 */
export const useUploadUsage = () => {
  const usage = ref<UploadUsage | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");
  const latest = useLatestRequest();

  const load = async () => {
    const signal = latest.next();
    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.Uploads.usage, {
      failure: Messages.Uploads.usageFailed,
      signal
    });
    // A newer load replaced this one, or the page is gone.
    if (signal.aborted) return;

    if (result.ok) {
      usage.value = result.data;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  return { usage, isLoading, errorMessage, load };
};
