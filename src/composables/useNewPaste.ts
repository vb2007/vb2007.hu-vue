import { computed, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { detectLanguage } from "@/scripts/pastebin/detect";
import { PLAINTEXT } from "@/scripts/pastebin/languages";
import { validatePaste } from "@/scripts/pastebin/paste";
import type { Paste } from "@/types/api/pastebin";

/** The composer's language choice when the user hasn't picked one: follow the detection. */
export const AUTO_LANGUAGE = "auto";
/** Detection waits for typing to pause; a paste lands in one change, so it shows up right after. */
const DETECT_DELAY = 250;

/** State and request logic for creating a paste. */
export const useNewPaste = () => {
  const content = ref("");
  /** AUTO_LANGUAGE, or the language the user picked. */
  const language = ref(AUTO_LANGUAGE);
  const detected = ref(PLAINTEXT);
  const resolvedLanguage = computed(() =>
    language.value === AUTO_LANGUAGE ? detected.value : language.value
  );
  const createdPaste = ref<Paste | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");

  watch(content, (value, _old, onCleanup) => {
    const timer = setTimeout(() => (detected.value = detectLanguage(value)), DETECT_DELAY);
    onCleanup(() => clearTimeout(timer));
  });

  const create = async () => {
    const invalid = validatePaste(content.value);
    if (invalid) {
      errorMessage.value = invalid;
      return;
    }

    // Sent straight after typing, the delayed detection may not have caught up yet.
    if (language.value === AUTO_LANGUAGE) {
      detected.value = detectLanguage(content.value);
    }

    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.Pastebin.create, {
      body: { paste: content.value, language: resolvedLanguage.value },
      failure: Messages.Pastebin.createFailed
    });

    if (result.ok) {
      createdPaste.value = result.data.paste;
      content.value = "";
      language.value = AUTO_LANGUAGE;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  const reset = () => {
    createdPaste.value = null;
    errorMessage.value = "";
  };

  return {
    content,
    language,
    detected,
    resolvedLanguage,
    createdPaste,
    isLoading,
    errorMessage,
    create,
    reset
  };
};
