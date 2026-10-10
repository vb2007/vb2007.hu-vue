import { ref } from "vue";
import { Pastebin } from "@/constants/api";
import { errorFrom, type Paste } from "@/scripts/pastebin/paste";

/** Loads a single paste. Public: anyone with the link can read it. */
export const usePaste = () => {
  const paste = ref<Paste | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");

  const load = async (id: string) => {
    try {
      isLoading.value = true;
      errorMessage.value = "";
      paste.value = null;

      const response = await fetch(Pastebin.pasteWithId.replace(":id", encodeURIComponent(id)), {
        method: "GET",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        paste.value = data.paste;
      } else if (response.status === 400) {
        errorMessage.value = "That isn't a valid paste link.";
      } else {
        errorMessage.value = await errorFrom(response, "Failed to load paste");
        console.error("Failed to load paste: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error loading paste: ", error);
    } finally {
      isLoading.value = false;
    }
  };

  return { paste, isLoading, errorMessage, load };
};
