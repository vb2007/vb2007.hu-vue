import { onBeforeUnmount, ref, watch } from "vue";
import { UserUploads } from "@/constants/api";
import { errorFrom, type Pagination } from "@/scripts/pastebin/paste";
import type { SortOrder, Upload, UploadSortBy, UploadVisibility } from "@/scripts/uploads/upload";

export const UPLOADS_PER_PAGE = 10;
export const SEARCH_DELAY_MS = 300;

export type UploadAction = "rename" | "visibility" | "delete";

/** Whose uploads an admin listing shows (vb2007/vb2007.hu-api#122). */
export interface UploadOwner {
  id: string;
  username: string;
}

/**
 * A page of uploads at a time, with search, filter, sort and edits. By default the logged-in
 * user's own; `listUrl` points it at another listing, e.g. one user's uploads for the admin.
 */
export const useUploads = (limit = UPLOADS_PER_PAGE, listUrl = UserUploads.uploads) => {
  const uploads = ref<Upload[]>([]);
  const pagination = ref<Pagination | null>(null);
  /** Set when the listing says whose uploads they are; the user's own listing doesn't. */
  const owner = ref<UploadOwner | null>(null);
  const page = ref(1);
  const sortBy = ref<UploadSortBy>("uploadedOn");
  const sortOrder = ref<SortOrder>("desc");
  const visibilityFilter = ref<UploadVisibility | "">("");
  const query = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");
  /** The row an edit is running on, and which edit. */
  const busyId = ref("");
  const busyAction = ref<UploadAction | "">("");
  /** The last failed edit, shown on its row. */
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
    if (visibilityFilter.value) params.set("visibility", visibilityFilter.value);
    const search = query.value.trim();
    if (search) params.set("q", search);
    loadedSearch = search;

    try {
      isLoading.value = true;
      errorMessage.value = "";

      const response = await fetch(`${listUrl}?${params}`, {
        method: "GET",
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json();
        uploads.value = data.uploads;
        pagination.value = data.pagination;
        owner.value = data.user ?? null;
      } else {
        errorMessage.value = await errorFrom(response, "Failed to load your uploads");
        console.error("Failed to load uploads: ", response.status);
      }
    } catch (error) {
      errorMessage.value = "Error connecting to server";
      console.error("Error loading uploads: ", error);
    } finally {
      isLoading.value = false;
    }
  };

  const goToPage = (target: number) => {
    page.value = target;
    return load();
  };

  const setSort = (by: UploadSortBy, order: SortOrder) => {
    sortBy.value = by;
    sortOrder.value = order;
    return goToPage(1);
  };

  const setVisibilityFilter = (visibility: UploadVisibility | "") => {
    visibilityFilter.value = visibility;
    return goToPage(1);
  };

  // Typing in the search box reloads once the user pauses, unless the list already shows that
  // search (e.g. only spaces changed, or clearing the filters loaded it already).
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  watch(query, () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (query.value.trim() !== loadedSearch) goToPage(1);
    }, SEARCH_DELAY_MS);
  });
  onBeforeUnmount(() => clearTimeout(searchTimer));

  /** Runs one edit on a row, keeping `busyId`/`rowError` in step. Returns whether it worked. */
  const edit = async (
    id: string,
    action: UploadAction,
    init: RequestInit,
    onDone: (response: Response) => Promise<void>
  ) => {
    const failure = {
      rename: "Failed to rename upload",
      visibility: "Failed to change visibility",
      delete: "Failed to delete upload"
    }[action];
    try {
      busyId.value = id;
      busyAction.value = action;
      rowError.value = { id: "", message: "" };

      const response = await fetch(
        UserUploads.uploadWithId.replace(":id", encodeURIComponent(id)),
        {
          ...init,
          credentials: "include"
        }
      );

      if (response.ok) {
        await onDone(response);
        return true;
      }
      rowError.value = { id, message: await errorFrom(response, failure) };
      console.error(`${failure}: `, response.status);
    } catch (error) {
      rowError.value = { id, message: "Error connecting to server" };
      console.error(`${failure}: `, error);
    } finally {
      busyId.value = "";
      busyAction.value = "";
    }
    return false;
  };

  const patch = (id: string, action: UploadAction, changes: Partial<Upload>) =>
    edit(
      id,
      action,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes)
      },
      async (response) => {
        const { upload } = (await response.json()) as { upload: Upload };
        // A filtered list may no longer include it, so ask again; otherwise swap it in place.
        if (visibilityFilter.value && upload.visibility !== visibilityFilter.value) {
          await load();
        } else {
          uploads.value = uploads.value.map((item) => (item.id === id ? upload : item));
        }
      }
    );

  const rename = (id: string, originalFileName: string) =>
    patch(id, "rename", { originalFileName: originalFileName.trim() });

  const setVisibility = (id: string, visibility: UploadVisibility) =>
    patch(id, "visibility", { visibility });

  const remove = (id: string) =>
    edit(id, "delete", { method: "DELETE" }, async () => {
      // Deleting the last upload on a page would leave it empty, so step back one.
      if (uploads.value.length === 1 && page.value > 1) {
        page.value -= 1;
      }
      await load();
    });

  return {
    uploads,
    pagination,
    owner,
    page,
    sortBy,
    sortOrder,
    visibilityFilter,
    query,
    isLoading,
    errorMessage,
    busyId,
    busyAction,
    rowError,
    load,
    goToPage,
    setSort,
    setVisibilityFilter,
    rename,
    setVisibility,
    remove
  };
};
