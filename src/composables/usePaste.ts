import { ref } from "vue";
import { Pastebin } from "@/constants/api";
import { errorFrom, type Paste } from "@/scripts/pastebin/paste";

/** Loads a single paste. Public: anyone with the link can read it; only its owner can change its language. */
export const usePaste = () => {
  const paste = ref<Paste | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");
  const isSaving = ref(false);
  const saveError = ref("");

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

  /** Changes the loaded paste's language (vb2007/vb2007.hu-api#124). */
  const setLanguage = async (language: string) => {
    if (!paste.value) return;
    const id = paste.value._id;

    try {
      isSaving.value = true;
      saveError.value = "";

      const response = await fetch(Pastebin.pasteWithId.replace(":id", encodeURIComponent(id)), {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ language }),
        credentials: "include"
      });

      if (response.ok) {
        // Keep the loaded paste (its populated author) and only swap the language.
        paste.value = { ...paste.value, language };
      } else {
        saveError.value = await errorFrom(response, "Failed to change the language");
        console.error("Failed to change the paste's language: ", response.status);
      }
    } catch (error) {
      saveError.value = "Error connecting to server";
      console.error("Error changing the paste's language: ", error);
    } finally {
      isSaving.value = false;
    }
  };

  return { paste, isLoading, errorMessage, load, isSaving, saveError, setLanguage };
};
