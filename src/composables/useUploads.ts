import { onBeforeUnmount, ref, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest, type ApiResult } from "@/scripts/api/client";
import type { ParamsOf } from "@/scripts/api/endpoint";
import type { Pagination, SortOrder } from "@/types/api/common";
import type {
  UpdateUploadBody,
  Upload,
  UploadListQuery,
  UploadOwner,
  UploadSortBy,
  UploadVisibility
} from "@/types/api/uploads";

export const UPLOADS_PER_PAGE = 10;
export const SEARCH_DELAY_MS = 300;

export type UploadAction = "rename" | "visibility" | "delete";

/**
 * Where a list of uploads loads from: the logged-in user's own, or one user's for the admin
 * (vb2007/vb2007.hu-api#122). Both answer with an `UploadsResponse`.
 */
export type UploadListing =
  | { endpoint: typeof Endpoints.Uploads.list }
  | {
      endpoint: typeof Endpoints.Admin.userUploads;
      params: ParamsOf<typeof Endpoints.Admin.userUploads>;
    };

const OWN_UPLOADS: UploadListing = { endpoint: Endpoints.Uploads.list };

const EDIT_FAILURES: Record<UploadAction, string> = {
  rename: Messages.Uploads.renameFailed,
  visibility: Messages.Uploads.visibilityFailed,
  delete: Messages.Uploads.deleteFailed
};

/**
 * A page of uploads at a time, with search, filter, sort and edits. By default the logged-in
 * user's own; `listing` points it at another one, e.g. one user's uploads for the admin.
 */
export const useUploads = (limit = UPLOADS_PER_PAGE, listing: UploadListing = OWN_UPLOADS) => {
  const uploads = ref<Upload[]>([]);
  const pagination = ref<Pagination<UploadSortBy> | null>(null);
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

  const fetchListing = (listQuery: UploadListQuery) => {
    const failure = Messages.Uploads.listFailed;
    return "params" in listing
      ? apiRequest(listing.endpoint, { params: listing.params, query: listQuery, failure })
      : apiRequest(listing.endpoint, { query: listQuery, failure });
  };

  const load = async () => {
    const search = query.value.trim();
    loadedSearch = search;

    isLoading.value = true;
    errorMessage.value = "";

    const result = await fetchListing({
      limit,
      page: page.value,
      sortBy: sortBy.value,
      sortOrder: sortOrder.value,
      visibility: visibilityFilter.value || undefined,
      q: search || undefined
    });

    if (result.ok) {
      uploads.value = result.data.uploads;
      pagination.value = result.data.pagination;
      owner.value = result.data.user ?? null;
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
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
  const edit = async <Data>(
    id: string,
    action: UploadAction,
    request: (failure: string) => Promise<ApiResult<Data>>,
    onDone: (data: Data) => Promise<void> | void
  ) => {
    busyId.value = id;
    busyAction.value = action;
    rowError.value = { id: "", message: "" };

    const result = await request(EDIT_FAILURES[action]);

    if (result.ok) {
      await onDone(result.data);
    } else {
      rowError.value = { id, message: result.error };
    }
    busyId.value = "";
    busyAction.value = "";
    return result.ok;
  };

  const patch = (id: string, action: UploadAction, changes: UpdateUploadBody) =>
    edit(
      id,
      action,
      (failure) => apiRequest(Endpoints.Uploads.update, { params: { id }, body: changes, failure }),
      async ({ upload }) => {
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
    edit(
      id,
      "delete",
      (failure) => apiRequest(Endpoints.Uploads.remove, { params: { id }, failure }),
      async () => {
        // Deleting the last upload on a page would leave it empty, so step back one.
        if (uploads.value.length === 1 && page.value > 1) {
          page.value -= 1;
        }
        await load();
      }
    );

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
