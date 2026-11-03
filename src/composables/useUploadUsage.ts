import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import type { UploadUsage } from "@/types/api/uploads";

/** How much of their quota the user has used, and the upload rules the API enforces. */
export const useUploadUsage = () => {
  const usage = ref<UploadUsage | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");

  const load = async () => {
    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.Uploads.usage, {
      failure: Messages.Uploads.usageFailed
    });

    if (result.ok) {
      usage.value = result.data;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  return { usage, isLoading, errorMessage, load };
};
