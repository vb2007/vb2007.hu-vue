import { ref } from "vue";
import { Pastebin } from "@/constants/api";
import { errorFrom, validatePaste, type Paste } from "@/scripts/pastebin/paste";

/** State and request logic for creating a paste. */
export const useNewPaste = () => {
  const content = ref("");
  const createdPaste = ref<Paste | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");

  const create = async () => {
    const invalid = validatePaste(content.value);
    if (invalid) {
      errorMessage.value = invalid;
      return;
    }

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(Pastebin.paste, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paste: content.value
        }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        createdPaste.value = data.paste;
        content.value = "";
      } else {
        errorMessage.value = await errorFrom(response, "Failed to create paste");
        console.error("Failed to create paste: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error creating paste: ", error);
    } finally {
      isLoading.value = false;
    }
  };

  const reset = () => {
    createdPaste.value = null;
    errorMessage.value = "";
  };

  return { content, createdPaste, isLoading, errorMessage, create, reset };
};
