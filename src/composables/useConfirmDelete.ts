import { onScopeDispose, ref } from "vue";

/** How long a delete key stays armed for its second click. */
export const CONFIRM_DELETE_MS = 4000;

/**
 * Deleting takes two clicks: the first arms one row, the second on the same row runs the delete.
 * The armed state wears off after `CONFIRM_DELETE_MS`, or when another row is armed, so a list
 * only ever has one armed at a time.
 */
export const useConfirmDelete = () => {
  const armedId = ref("");
  let timer: ReturnType<typeof setTimeout> | undefined;

  const disarm = () => {
    clearTimeout(timer);
    armedId.value = "";
  };

  const isArmed = (id: string) => armedId.value === id;

  /** Arms `id`, or, when it's armed already, disarms it and returns what `remove` returns. */
  const press = <T>(id: string, remove: () => T): T | undefined => {
    if (!isArmed(id)) {
      disarm();
      armedId.value = id;
      timer = setTimeout(disarm, CONFIRM_DELETE_MS);
      return undefined;
    }
    disarm();
    return remove();
  };

  onScopeDispose(() => clearTimeout(timer), true);

  return { armedId, isArmed, press, disarm };
};
