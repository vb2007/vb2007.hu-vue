import { computed, ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { useSignedLinkRefresh } from "@/composables/useSignedLinkRefresh";
import { apiRequest, type ApiResult } from "@/scripts/api/client";
import type { ParamsOf } from "@/scripts/api/endpoint";
import type {
  UpdateUploadBody,
  UploadListQuery,
  UploadOwner,
  UploadSortBy,
  UploadVisibility
} from "@/types/api/uploads";

export const UPLOADS_PER_PAGE = 10;

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
      /** The owner's name before the first answer names them, e.g. from the link that led here. */
      ownerHint?: string;
    };

const OWN_UPLOADS: UploadListing = { endpoint: Endpoints.Uploads.list };

const DEFAULT_SORT: ListSort<UploadSortBy> = { by: "uploadedOn", order: "desc" };

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
  /** Set when the listing says whose uploads they are; the user's own listing doesn't. */
  const owner = ref<UploadOwner | null>(null);
  /** The owner's name as best known: from the listing once it answers, else from its hint. */
  const ownerName = computed(() =>
    "params" in listing ? (owner.value?.username ?? listing.ownerHint) : undefined
  );
  const visibilityFilter = ref<UploadVisibility | "">("");
  /** The row an edit is running on, and which edit. */
  const busyId = ref("");
  const busyAction = ref<UploadAction | "">("");
  /** The last failed edit, shown on its row. */
  const rowError = ref({ id: "", message: "" });

  const fetchListing = (listQuery: UploadListQuery, signal: AbortSignal) => {
    if (!("params" in listing)) {
      return apiRequest(listing.endpoint, {
        query: listQuery,
        failure: Messages.Uploads.listFailed,
        signal
      });
    }
    const failure = Messages.Admin.userUploadsFailed(ownerName.value);
    return apiRequest(listing.endpoint, {
      params: listing.params,
      query: listQuery,
      failure,
      signal
    });
  };

  const {
    items: uploads,
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
    filters: () => ({ visibility: visibilityFilter.value || undefined }),
    fetch: fetchListing,
    items: (data) => data.uploads,
    onLoad: (data) => (owner.value = data.user ?? null)
  });

  const setVisibilityFilter = (visibility: UploadVisibility | "") => {
    visibilityFilter.value = visibility;
    return goToPage(1);
  };

  // Private links expire: load the page again for new ones, unless a load that brings them is
  // already running, or an edit is (its row could come back as it was); that one asks after.
  // A load that failed leaves the old links, so it's asked for again.
  const { refreshIfDue } = useSignedLinkRefresh(
    () => uploads.value.map((upload) => upload.url),
    async () => {
      if (isLoading.value || busyId.value) return false;
      await load();
      return !errorMessage.value;
    }
  );

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
    refreshIfDue();
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
      reloadAfterRemove
    );

  return {
    uploads,
    pagination,
    owner,
    ownerName,
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
