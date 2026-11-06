import { onScopeDispose, ref } from "vue";
import { copiedLinkNote, linkExpiresAt } from "@/scripts/uploads/upload";

/**
 * The note shown after copying a signed link: when that copy expires. It goes once it has, or on
 * `clear`; a plain link gets none.
 */
export const useCopiedLinkNote = () => {
  const note = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  const clear = () => {
    clearTimeout(timer);
    note.value = "";
  };

  const show = (url: string) => {
    clear();
    const at = linkExpiresAt(url);
    if (at === undefined) return;
    note.value = copiedLinkNote(url);
    // A signed link lasts an hour, well inside what `setTimeout` can wait.
    timer = setTimeout(clear, at - Date.now());
  };

  onScopeDispose(() => clearTimeout(timer));

  return { note, show, clear };
};
