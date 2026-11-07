import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { apiRequest } from "@/scripts/api/client";
import { username } from "@/scripts/authentication/authState";
import type { SortOrder } from "@/types/api/common";
import type { PasteSortBy } from "@/types/api/pastebin";

export const PASTES_PER_PAGE = 10;

const DEFAULT_SORT: ListSort<PasteSortBy> = { by: "addedOn", order: "desc" };

/** The logged-in user's pastes, a page at a time, and deleting them. */
export const usePastes = (limit = PASTES_PER_PAGE) => {
  const {
    items: pastes,
    pagination,
    page,
    sortBy,
    sortOrder,
    isLoading,
    errorMessage,
    load,
    goToPage,
    setSort,
    reloadAfterRemove
  } = usePagedList({
    limit,
    sort: DEFAULT_SORT,
    fetch: (query, signal) =>
      apiRequest(Endpoints.Pastebin.list, {
        params: { username: username.value },
        query,
        failure: Messages.Pastebin.listFailed,
        signal
      }),
    items: (data) => data.pastes
  });
  const deletingId = ref("");
  const deleteError = ref("");

  /** Pastes only sort by date, so only the order changes. */
  const setSortOrder = (order: SortOrder) => setSort(sortBy.value, order);

  const remove = async (id: string) => {
    deletingId.value = id;
    deleteError.value = "";

    const result = await apiRequest(Endpoints.Pastebin.remove, {
      params: { id },
      failure: Messages.Pastebin.deleteFailed
    });

    if (result.ok) {
      await reloadAfterRemove();
    } else {
      deleteError.value = result.error;
    }
    deletingId.value = "";
  };

  return {
    pastes,
    pagination,
    page,
    sortOrder,
    isLoading,
    errorMessage,
    deletingId,
    deleteError,
    load,
    goToPage,
    setSortOrder,
    remove
  };
};
