/** Shapes every API route shares. */

export type SortOrder = "asc" | "desc";

/** A success that only carries the API's message. */
export interface MessageResponse {
  message: string;
}

/**
 * What the API sends when a request fails, a 500 included. Only an answer that never came from the
 * API (a gateway's 502/504 page, say) has no JSON body at all.
 */
export interface ApiErrorBody {
  error?: string;
  /** Seconds before trying again, on any 429: the code cooldown's or a rate limiter's. */
  retryAfter?: number;
}

/** The `pagination` object of every list route; `pages` is 0 for an empty list. */
export interface BasePagination {
  limit: number;
  page: number;
  total: number;
  pages: number;
}

/** The `pagination` object of a sorted list route (every one but pending registrations). */
export interface Pagination<SortBy extends string = string> extends BasePagination {
  sortBy: SortBy;
  sortOrder: SortOrder;
}

/**
 * The page every list route takes; on its own, the query of a list without a sort (pending
 * registrations). Types, not interfaces, so they fit `QueryValues`.
 */
export type PageQuery = { limit: number; page: number };

/** The query every sorted list route takes. */
export type ListQuery<SortBy extends string> = PageQuery & {
  sortBy: SortBy;
  sortOrder: SortOrder;
};
