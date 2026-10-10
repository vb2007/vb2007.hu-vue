import { ref } from "vue";
import { Pastebin } from "@/constants/api";
import { username } from "@/scripts/authentication/authState";
import { errorFrom, type Pagination, type Paste, type SortOrder } from "@/scripts/pastebin/paste";

export const PASTES_PER_PAGE = 10;

/** The logged-in user's pastes, a page at a time, and deleting them. */
export const usePastes = (limit = PASTES_PER_PAGE) => {
  const pastes = ref<Paste[]>([]);
  const pagination = ref<Pagination | null>(null);
  const page = ref(1);
  const sortOrder = ref<SortOrder>("desc");
  const isLoading = ref(false);
  const errorMessage = ref("");
  const deletingId = ref("");
  const deleteError = ref("");

  const load = async () => {
    const query = new URLSearchParams({
      limit: String(limit),
      page: String(page.value),
      sortBy: "addedOn",
      sortOrder: sortOrder.value
    });
    const url = Pastebin.pastesByUsername.replace(":username", encodeURIComponent(username.value));

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(`${url}?${query}`, {
        method: "GET",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        pastes.value = data.pastes;
        pagination.value = data.pagination;
      } else {
        errorMessage.value = await errorFrom(response, "Failed to load your pastes");
        console.error("Failed to load pastes: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error loading pastes: ", error);
    } finally {
      isLoading.value = false;
    }
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
    try {
      deletingId.value = id;
      deleteError.value = "";

      const response = await fetch(Pastebin.pasteWithId.replace(":id", encodeURIComponent(id)), {
        method: "DELETE",
        credentials: "include"
      });

      if (response.ok) {
        // Deleting the last paste on a page would leave it empty, so step back one.
        if (pastes.value.length === 1 && page.value > 1) {
          page.value -= 1;
        }
        await load();
      } else {
        deleteError.value = await errorFrom(response, "Failed to delete paste");
        console.error("Failed to delete paste: ", response.status);
      }
    } catch (error) {
      deleteError.value = "Error connecting to server";
      console.error("Error deleting paste: ", error);
    } finally {
      deletingId.value = "";
    }
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
