import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { usePagedList, type ListSort } from "@/composables/usePagedList";
import { useShortLinkDelete } from "@/composables/useShortLinkDelete";
import { apiRequest } from "@/scripts/api/client";
import type { ShortUrlSortBy } from "@/types/api/shortener";

export const ADMIN_SHORT_LINKS_PER_PAGE = 20;

const DEFAULT_SORT: ListSort<ShortUrlSortBy> = { by: "addedOn", order: "desc" };

/**
 * Every short link on the site, newest first, a page at a time, for the superuser to check or
 * delete. Deleting uses the owner's own route, which lets the superuser through.
 */
export const useAdminShortLinks = (limit = ADMIN_SHORT_LINKS_PER_PAGE) => {
  const {
    items: links,
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
    fetch: (listQuery, signal) =>
      apiRequest(Endpoints.Admin.shortUrls, {
        query: listQuery,
        failure: Messages.Admin.shortLinksFailed,
        signal
      }),
    items: (data) => data.shortUrls,
    // A delete's error belongs to the rows it was shown with.
    onLoad: () => clearError()
  });
  const { deleteError, isDeleting, clearError, remove } = useShortLinkDelete(reloadAfterRemove);

  return {
    links,
    pagination,
    page,
    sortBy,
    sortOrder,
    query,
    isLoading,
    errorMessage,
    deleteError,
    isDeleting,
    clearError,
    load,
    goToPage,
    setSort,
    remove
  };
};
