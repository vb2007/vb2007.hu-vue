import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";

/**
 * Deletes short links by code (`DELETE /shortenUrl/:shortenedUrl`), for any list of them: the
 * user's own, or every account's for the superuser, whom the API lets delete any link.
 *
 * `afterRemove` reloads the list, e.g. its `reloadAfterRemove`. It also runs on a 404, since the
 * link is gone either way (deleted in another tab, say), and the row shouldn't linger. Any refusal
 * (403 for someone else's link, 404) shows the API's own text in `deleteError`.
 */
export const useShortLinkDelete = (afterRemove: () => Promise<void>) => {
  /** The code being deleted, or "". */
  const deletingCode = ref("");
  const deleteError = ref("");

  /** Whether the link was deleted. */
  const remove = async (code: string) => {
    deletingCode.value = code;
    deleteError.value = "";

    const result = await apiRequest(Endpoints.ShortUrl.remove, {
      params: { shortenedUrl: code },
      failure: Messages.ShortUrl.deleteFailed,
      quietStatuses: [HttpStatus.NotFound]
    });

    if (!result.ok) deleteError.value = result.error;
    if (result.ok || result.status === HttpStatus.NotFound) await afterRemove();
    deletingCode.value = "";
    return result.ok;
  };

  return { deletingCode, deleteError, remove };
};
