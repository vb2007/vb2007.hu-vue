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
    items: (data) => data.shortUrls
  });
  const { deletingCode, deleteError, remove } = useShortLinkDelete(reloadAfterRemove);

  return {
    links,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    deletingCode,
    deleteError,
    load,
    goToPage,
    remove
  };
};
