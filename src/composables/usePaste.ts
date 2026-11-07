import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import type { Paste } from "@/types/api/pastebin";

/**
 * Loads a single paste. Public: anyone with the link can read it; only its owner can change its
 * language. Loading another one aborts a load still in flight, as leaving the page does.
 */
export const usePaste = () => {
  const paste = ref<Paste | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");
  const isSaving = ref(false);
  const saveError = ref("");
  const latest = useLatestRequest();

  const load = async (id: string) => {
    const signal = latest.next();
    isLoading.value = true;
    errorMessage.value = "";
    paste.value = null;

    const result = await apiRequest(Endpoints.Pastebin.get, {
      params: { id },
      failure: Messages.Pastebin.loadFailed,
      signal
    });
    // Another paste's load replaced this one, or the page is gone.
    if (signal.aborted) return;

    if (result.ok) {
      paste.value = result.data.paste;
    } else if (result.status === HttpStatus.BadRequest) {
      errorMessage.value = Messages.Pastebin.invalidLink;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  /** Changes the loaded paste's language (vb2007/vb2007.hu-api#124). */
  const setLanguage = async (language: string) => {
    if (!paste.value) return;

    isSaving.value = true;
    saveError.value = "";

    const result = await apiRequest(Endpoints.Pastebin.update, {
      params: { id: paste.value._id },
      body: { language },
      failure: Messages.Pastebin.languageChangeFailed
    });

    if (result.ok) {
      // Keep the loaded paste (its populated author) and only swap the language.
      paste.value = { ...paste.value, language };
    } else {
      saveError.value = result.error;
    }
    isSaving.value = false;
  };

  return { paste, isLoading, errorMessage, load, isSaving, saveError, setLanguage };
};
