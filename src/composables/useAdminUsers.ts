import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { apiRequest } from "@/scripts/api/client";
import type { AdminUserSortBy } from "@/types/api/admin";

export const USERS_PER_PAGE = 20;

const DEFAULT_SORT: ListSort<AdminUserSortBy> = { by: "usedBytes", order: "desc" };

/** Every user with their upload usage, a page at a time, for the superuser to set quotas. */
export const useAdminUsers = (limit = USERS_PER_PAGE) => {
  const {
    items: users,
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
    updateItems
  } = usePagedList({
    limit,
    sort: DEFAULT_SORT,
    fetch: (listQuery, signal) =>
      apiRequest(Endpoints.Admin.users, {
        query: listQuery,
        failure: Messages.Admin.usersFailed,
        signal
      }),
    items: (data) => data.users
  });
  /** The user whose quota is being saved. */
  const savingId = ref("");
  /** The last failed save, shown on its row. */
  const rowError = ref({ id: "", message: "" });

  /** Sets a user's quota in bytes, or `null` for the default. Returns whether it worked. */
  const setQuota = async (id: string, quotaBytes: number | null) => {
    savingId.value = id;
    rowError.value = { id: "", message: "" };

    const result = await apiRequest(Endpoints.Admin.setUploadQuota, {
      params: { id },
      body: { quotaBytes },
      failure: Messages.Admin.quotaFailed
    });

    if (result.ok) {
      const { user } = result.data;
      updateItems((item) => (item.id === id ? user : item));
    } else {
      rowError.value = { id, message: result.error };
    }
    savingId.value = "";
    return result.ok;
  };

  return {
    users,
    pagination,
    page,
    sortBy,
    sortOrder,
    query,
    isLoading,
    errorMessage,
    savingId,
    rowError,
    load,
    goToPage,
    setSort,
    setQuota
  };
};
