import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { useShortLinkDelete } from "@/composables/useShortLinkDelete";
import { apiRequest } from "@/scripts/api/client";
import type { ShortUrlSortBy } from "@/types/api/shortener";

export const SHORT_LINKS_PER_PAGE = 10;

const DEFAULT_SORT: ListSort<ShortUrlSortBy> = { by: "addedOn", order: "desc" };

/** The logged-in user's short links, newest first, a page at a time, with search and delete. */
export const useShortLinks = (limit = SHORT_LINKS_PER_PAGE) => {
  const {
    items: links,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    load,
    goToPage,
    reloadAfterRemove
  } = usePagedList({
    limit,
    sort: DEFAULT_SORT,
    fetch: (listQuery, signal) =>
      apiRequest(Endpoints.ShortUrl.list, {
        query: listQuery,
        failure: Messages.ShortUrl.listFailed,
        signal
      }),
    items: (data) => data.shortUrls,
    // A delete's error belongs to the rows it was shown with.
    onLoad: () => clearError()
  });
  const { deleteError, isDeleting, clearError, remove } = useShortLinkDelete(reloadAfterRemove);

  /** Back to page 1 without the search, e.g. so a new link shows at the top. */
  const refresh = () => {
    // The search box's own reload then finds the list already loaded without a search.
    query.value = "";
    return goToPage(1);
  };

  return {
    links,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    deleteError,
    isDeleting,
    load,
    goToPage,
    refresh,
    remove
  };
};
