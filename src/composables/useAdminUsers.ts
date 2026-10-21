import { onBeforeUnmount, ref, watch } from "vue";
import { Admin } from "@/constants/api";
import { errorFrom, type Pagination } from "@/scripts/pastebin/paste";
import type { AdminUser, AdminUserSortBy, SortOrder } from "@/scripts/admin/adminUser";

export const USERS_PER_PAGE = 20;
export const SEARCH_DELAY_MS = 300;

/** Every user with their upload usage, a page at a time, for the superuser to set quotas. */
export const useAdminUsers = (limit = USERS_PER_PAGE) => {
  const users = ref<AdminUser[]>([]);
  const pagination = ref<Pagination | null>(null);
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
    const params = new URLSearchParams({
      limit: String(limit),
      page: String(page.value),
      sortBy: sortBy.value,
      sortOrder: sortOrder.value
    });
    const search = query.value.trim();
    if (search) params.set("q", search);
    loadedSearch = search;

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(`${Admin.users}?${params}`, {
        method: "GET",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        users.value = data.users;
        pagination.value = data.pagination;
      } else {
        errorMessage.value = await errorFrom(response, "Failed to load the users");
        console.error("Failed to load users: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error loading users: ", error);
    } finally {
      isLoading.value = false;
    }
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
    const failure = "Failed to change the quota";
    try {
      savingId.value = id;
      rowError.value = { id: "", message: "" };

      const response = await fetch(Admin.uploadQuota.replace(":id", encodeURIComponent(id)), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotaBytes }),
        credentials: "include"
      });

      if (response.ok) {
        const { user } = (await response.json()) as { user: AdminUser };
        users.value = users.value.map((item) => (item.id === id ? user : item));
        return true;
      }
      rowError.value = { id, message: await errorFrom(response, failure) };
      console.error(`${failure}: `, response.status);
    } catch (error) {
      rowError.value = { id, message: "Error connecting to server" };
      console.error(`${failure}: `, error);
    } finally {
      savingId.value = "";
    }
    return false;
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
