import { ref } from "vue";
import { UserUploads } from "@/constants/api";
import { errorFrom } from "@/scripts/pastebin/paste";
import type { UploadUsage } from "@/scripts/uploads/upload";

/** How much of their quota the user has used, and the upload rules the API enforces. */
export const useUploadUsage = () => {
  const usage = ref<UploadUsage | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");

  const load = async () => {
    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(UserUploads.usage, { method: "GET", credentials: "include" });

      if (response.ok) {
        usage.value = await response.json();
      } else {
        errorMessage.value = await errorFrom(response, "Failed to load your storage");
        console.error("Failed to load upload usage: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error loading upload usage: ", error);
    } finally {
      isLoading.value = false;
    }
  };

  return { usage, isLoading, errorMessage, load };
};
