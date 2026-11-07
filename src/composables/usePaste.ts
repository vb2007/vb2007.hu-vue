import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import type { Paste } from "@/types/api/pastebin";

/**
 * How a language save ended: `gone` when the paste it was sent for is no longer on show (another
 * one, or none, is), so its answer was left out.
 */
export type LanguageSave = "saved" | "failed" | "gone";

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
    // A save still on its way belongs to the paste that was on show.
    isSaving.value = false;
    saveError.value = "";
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

  /**
   * Changes the loaded paste's language (vb2007/vb2007.hu-api#124). An answer that lands once
   * another paste is on show, or while one loads, leaves it alone.
   */
  const setLanguage = async (language: string): Promise<LanguageSave> => {
    if (!paste.value) return "gone";
    const id = paste.value._id;

    isSaving.value = true;
    saveError.value = "";

    const result = await apiRequest(Endpoints.Pastebin.update, {
      params: { id },
      body: { language },
      failure: Messages.Pastebin.languageChangeFailed
    });

    if (paste.value?._id !== id) return "gone";
    isSaving.value = false;
    if (!result.ok) {
      saveError.value = result.error;
      return "failed";
    }
    // Keep the loaded paste (its populated author) and only swap the language.
    paste.value = { ...paste.value, language };
    return "saved";
  };

  return { paste, isLoading, errorMessage, load, isSaving, saveError, setLanguage };
};
