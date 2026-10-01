import { onBeforeUnmount, ref } from "vue";

/** Copies text and exposes a short-lived `copied` flag for button feedback. */
export const useClipboard = (resetAfterMs = 1800) => {
  const copied = ref(false);
  const failed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const copy = async (text: string) => {
    clearTimeout(timer);
    try {
      await navigator.clipboard.writeText(text);
      copied.value = true;
      failed.value = false;
    } catch (error) {
      console.error("Failed to copy to clipboard: ", error);
      copied.value = false;
      failed.value = true;
    }
    timer = setTimeout(() => {
      copied.value = false;
      failed.value = false;
    }, resetAfterMs);
  };

  onBeforeUnmount(() => clearTimeout(timer));

  return { copied, failed, copy };
};
