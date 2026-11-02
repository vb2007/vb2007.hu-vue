import { onBeforeUnmount, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import type { AdminUser, AdminUserSortBy } from "@/types/api/admin";
import type { Pagination, SortOrder } from "@/types/api/common";

export const USERS_PER_PAGE = 20;
export const SEARCH_DELAY_MS = 300;

/** Every user with their upload usage, a page at a time, for the superuser to set quotas. */
export const useAdminUsers = (limit = USERS_PER_PAGE) => {
  const users = ref<AdminUser[]>([]);
  const pagination = ref<Pagination<AdminUserSortBy> | null>(null);
  const page = ref(1);
  const sortBy = ref<AdminUserSortBy>("usedBytes");
  const sortOrder = ref<SortOrder>("desc");
  const query = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");
  /** The user whose quota is being saved. */
  const savingId = ref("");
  /** The last failed save, shown on its row. */
  const rowError = ref({ id: "", message: "" });

  /** The search the list was last loaded with. */
  let loadedSearch = "";

  const load = async () => {
    const search = query.value.trim();
    loadedSearch = search;

    isLoading.value = true;
    errorMessage.value = "";

    const result = await apiRequest(Endpoints.Admin.users, {
      query: {
        limit,
        page: page.value,
        sortBy: sortBy.value,
        sortOrder: sortOrder.value,
        q: search || undefined
      },
      failure: Messages.Admin.usersFailed
    });

    if (result.ok) {
      users.value = result.data.users;
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

  const setSort = (by: AdminUserSortBy, order: SortOrder) => {
    sortBy.value = by;
    sortOrder.value = order;
    return goToPage(1);
  };

  // Typing in the search box reloads once the user pauses, unless the list already shows it.
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  watch(query, () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (query.value.trim() !== loadedSearch) goToPage(1);
    }, SEARCH_DELAY_MS);
  });
  onBeforeUnmount(() => clearTimeout(searchTimer));

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
      users.value = users.value.map((item) => (item.id === id ? user : item));
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
