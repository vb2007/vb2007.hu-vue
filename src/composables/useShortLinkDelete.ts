import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";

/** The last failed delete, kept with its code so the list can show it on that link's row. */
export interface ShortLinkDeleteError {
  /** "" while there is none. */
  code: string;
  message: string;
}

const noError = (): ShortLinkDeleteError => ({ code: "", message: "" });

/**
 * Deletes short links by code (`DELETE /shortenUrl/:shortenedUrl`), for any list of them: the
 * user's own, or every account's for the superuser, whom the API lets delete any link.
 *
 * `afterRemove` reloads the list, e.g. its `reloadAfterRemove`. It also runs on a 404, since the
 * link is gone either way (deleted in another tab, say), and the row shouldn't linger. Any refusal
 * (403 for someone else's link, 404) leaves the API's own text in `deleteError`, set after the
 * reload, so a list that calls `clearError` on every load keeps it until its next one.
 */
export const useShortLinkDelete = (afterRemove: () => Promise<void>) => {
  /** The codes whose delete is running; more than one can be. */
  const deleting = ref(new Set<string>());
  const deleteError = ref<ShortLinkDeleteError>(noError());

  const isDeleting = (code: string) => deleting.value.has(code);

  const clearError = () => {
    deleteError.value = noError();
  };

  /** Whether the link was deleted. */
  const remove = async (code: string) => {
    deleting.value.add(code);
    clearError();

    const result = await apiRequest(Endpoints.ShortUrl.remove, {
      params: { shortenedUrl: code },
      failure: Messages.ShortUrl.deleteFailed,
      quietStatuses: [HttpStatus.NotFound]
    });

    if (result.ok || result.status === HttpStatus.NotFound) await afterRemove();
    if (!result.ok) deleteError.value = { code, message: result.error };
    deleting.value.delete(code);
    return result.ok;
  };

  return { deleteError, isDeleting, clearError, remove };
};
