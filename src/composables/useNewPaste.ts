import { computed, ref, watch } from "vue";
import { Pastebin } from "@/constants/api";
import { detectLanguage } from "@/scripts/pastebin/detect";
import { PLAINTEXT } from "@/scripts/pastebin/languages";
import { errorFrom, validatePaste, type Paste } from "@/scripts/pastebin/paste";

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

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(Pastebin.paste, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paste: content.value,
          language: resolvedLanguage.value
        }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        createdPaste.value = data.paste;
        content.value = "";
        language.value = AUTO_LANGUAGE;
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
