import { onScopeDispose, ref, watch, type Ref } from "vue";
import { useLatestRequest } from "@/composables/useLatestRequest";
import type { ApiResult } from "@/scripts/api/client";
import type { NoQuery, QueryValues } from "@/scripts/api/endpoint";
import type { BasePagination, ListQuery, SortOrder } from "@/types/api/common";

/** How long typing in a list's search box waits for a pause before the list reloads. */
export const SEARCH_DELAY_MS = 300;

/** A list's sort: which field, which way. */
export interface ListSort<SortBy extends string> {
  by: SortBy;
  order: SortOrder;
}

/** What every list route answers with, besides its rows. */
interface Listing {
  pagination: BasePagination;
}

/** The query of a list without a sort (pending registrations). */
export type PageQuery = { limit: number; page: number };

/** The search, left out while the box is empty. */
type SearchQuery = { q?: string };

interface CommonOptions<Data extends Listing, Item, Filters extends QueryValues> {
  limit: number;
  /** The rows in an answer, e.g. `(data) => data.users`. */
  items: (data: Data) => Item[];
  /** More query values, read on every load and sent between the sort and the search. */
  filters?: () => Filters;
  /** Runs with every answer that lands, e.g. to keep another field of it. */
  onLoad?: (data: Data) => void;
}

export interface SortedListOptions<
  Data extends Listing,
  Item,
  SortBy extends string,
  Filters extends QueryValues
> extends CommonOptions<Data, Item, Filters> {
  /** The sort it starts with. Type it (`ListSort<…SortBy>`), or `setSort` only takes this field. */
  sort: ListSort<SortBy>;
  /** Loads one page; `query` is ready to send as the endpoint's query. */
  fetch: (
    query: ListQuery<SortBy> & Filters & SearchQuery,
    signal: AbortSignal
  ) => Promise<ApiResult<Data>>;
}

export interface UnsortedListOptions<
  Data extends Listing,
  Item,
  Filters extends QueryValues
> extends CommonOptions<Data, Item, Filters> {
  sort?: undefined;
  /** Loads one page; `query` is ready to send as the endpoint's query. */
  fetch: (
    query: PageQuery & Filters & SearchQuery,
    signal: AbortSignal
  ) => Promise<ApiResult<Data>>;
}

export interface PagedList<Item, P extends BasePagination> {
  items: Ref<Item[]>;
  /** The last answer's, or `null` before the first one. */
  pagination: Ref<P | null>;
  page: Ref<number>;
  /** The search box's text. A change reloads from page 1 after `SEARCH_DELAY_MS`. */
  query: Ref<string>;
  isLoading: Ref<boolean>;
  errorMessage: Ref<string>;
  load: () => Promise<void>;
  goToPage: (page: number) => Promise<void>;
  /** Reloads after a row was deleted, a page back if it was the last one on a later page. */
  reloadAfterRemove: () => Promise<void>;
}

export interface SortedPagedList<
  Item,
  P extends BasePagination,
  SortBy extends string
> extends PagedList<Item, P> {
  sortBy: Ref<SortBy>;
  sortOrder: Ref<SortOrder>;
  /** Sorts and goes back to page 1. */
  setSort: (by: SortBy, order: SortOrder) => Promise<void>;
}

/**
 * One list route a page at a time: the page, the sort if it has one, a debounced search, and the
 * load, whose newer request aborts the one it replaces. A list without a search box just never
 * sets `query`, so `q` is never sent.
 */
export function usePagedList<
  Data extends Listing,
  Item,
  SortBy extends string,
  Filters extends QueryValues = NoQuery
>(
  options: SortedListOptions<Data, Item, SortBy, Filters>
): SortedPagedList<Item, Data["pagination"], SortBy>;
export function usePagedList<Data extends Listing, Item, Filters extends QueryValues = NoQuery>(
  options: UnsortedListOptions<Data, Item, Filters>
): PagedList<Item, Data["pagination"]>;
export function usePagedList(
  options:
    | SortedListOptions<Listing, unknown, string, QueryValues>
    | UnsortedListOptions<Listing, unknown, QueryValues>
) {
  const items = ref([]) as Ref<unknown[]>;
  const pagination = ref(null) as Ref<BasePagination | null>;
  const page = ref(1);
  const sortBy = ref(options.sort?.by);
  const sortOrder = ref(options.sort?.order);
  const query = ref("");
  const isLoading = ref(false);
  const errorMessage = ref("");

  /** The search the list was last loaded with. */
  let loadedSearch = "";
  const latest = useLatestRequest();

  const load = async () => {
    const search = query.value.trim();
    loadedSearch = search;
    const signal = latest.next();

    isLoading.value = true;
    errorMessage.value = "";

    const sort = options.sort && { sortBy: sortBy.value!, sortOrder: sortOrder.value! };
    const result = await options.fetch(
      {
        limit: options.limit,
        page: page.value,
        ...sort,
        ...options.filters?.(),
        q: search || undefined
      } as ListQuery<string> & SearchQuery,
      signal
    );
    // A newer load replaced this one, or the list is gone.
    if (signal.aborted) return;

    if (result.ok) {
      items.value = options.items(result.data);
      pagination.value = result.data.pagination;
      options.onLoad?.(result.data);
    } else {
      errorMessage.value = result.error;
    }
    isLoading.value = false;
  };

  const goToPage = (target: number) => {
    page.value = target;
    return load();
  };

  const setSort = (by: string, order: SortOrder) => {
    sortBy.value = by;
    sortOrder.value = order;
    return goToPage(1);
  };

  // Deleting the last row on a page would leave it empty, so step back one.
  const reloadAfterRemove = () => {
    if (items.value.length === 1 && page.value > 1) {
      page.value -= 1;
    }
    return load();
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
  onScopeDispose(() => clearTimeout(searchTimer), true);

  const list = {
    items,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    load,
    goToPage,
    reloadAfterRemove
  };
  return options.sort ? { ...list, sortBy, sortOrder, setSort } : list;
}
