import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import { username } from "@/scripts/authentication/authState";
import type { Pagination, SortOrder } from "@/types/api/common";
import type { Paste, PasteSortBy } from "@/types/api/pastebin";

export const PASTES_PER_PAGE = 10;

/** The logged-in user's pastes, a page at a time, and deleting them. */
export const usePastes = (limit = PASTES_PER_PAGE) => {
  const pastes = ref<Paste[]>([]);
  const pagination = ref<Pagination<PasteSortBy> | null>(null);
  const page = ref(1);
  const sortOrder = ref<SortOrder>("desc");
  const isLoading = ref(false);
  const errorMessage = ref("");
  const deletingId = ref("");
  const deleteError = ref("");
  const latest = useLatestRequest();

  const load = async () => {
    const signal = latest.next();

    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.Pastebin.list, {
      params: { username: username.value },
      query: { limit, page: page.value, sortBy: "addedOn", sortOrder: sortOrder.value },
      failure: Messages.Pastebin.listFailed,
      signal
    });
    // A newer load replaced this one, or the list is gone.
    if (signal.aborted) return;

    if (result.ok) {
      pastes.value = result.data.pastes;
      pagination.value = result.data.pagination;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  const goToPage = (target: number) => {
    page.value = target;
    return load();
  };

  const setSortOrder = (order: SortOrder) => {
    sortOrder.value = order;
    page.value = 1;
    return load();
  };

  const remove = async (id: string) => {
    deletingId.value = id;
    deleteError.value = "";

    const result = await apiRequest(Endpoints.Pastebin.remove, {
      params: { id },
      failure: Messages.Pastebin.deleteFailed
    });

    if (result.ok) {
      // Deleting the last paste on a page would leave it empty, so step back one.
      if (pastes.value.length === 1 && page.value > 1) {
        page.value -= 1;
      }
      await load();
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
