import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { apiRequest } from "@/scripts/api/client";
import type { PasteSortBy } from "@/types/api/pastebin";

export const ADMIN_PASTES_PER_PAGE = 20;

const DEFAULT_SORT: ListSort<PasteSortBy> = { by: "addedOn", order: "desc" };

/** Every paste on the site, a page at a time, for the superuser to open or delete. */
export const useAdminPastes = (limit = ADMIN_PASTES_PER_PAGE) => {
  const {
    items: pastes,
    pagination,
    page,
    sortBy,
    sortOrder,
    query,
    isLoading,
    errorMessage,
    load,
    goToPage,
    setSort,
    reloadAfterRemove
  } = usePagedList({
    limit,
    sort: DEFAULT_SORT,
    fetch: (listQuery, signal) =>
      apiRequest(Endpoints.Admin.pastes, {
        query: listQuery,
        failure: Messages.Admin.pastesFailed,
        signal
      }),
    items: (data) => data.pastes
  });
  /** The paste being deleted. */
  const deletingId = ref("");
  /** The last failed delete, shown on its row. */
  const rowError = ref({ id: "", message: "" });

  /** Deletes a paste with the owner's own route, which lets the superuser through. */
  const remove = async (id: string) => {
    deletingId.value = id;
    rowError.value = { id: "", message: "" };

    const result = await apiRequest(Endpoints.Pastebin.remove, {
      params: { id },
      failure: Messages.Pastebin.deleteFailed
    });

    if (result.ok) {
      await reloadAfterRemove();
    } else {
      rowError.value = { id, message: result.error };
    }
    deletingId.value = "";
  };

  return {
    pastes,
    pagination,
    page,
    sortBy,
    sortOrder,
    query,
    isLoading,
    errorMessage,
    deletingId,
    rowError,
    load,
    goToPage,
    setSort,
    remove
  };
};
