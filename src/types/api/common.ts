/** Shapes every API route shares. */

export type SortOrder = "asc" | "desc";

/** A success that only carries the API's message. */
export interface MessageResponse {
  message: string;
}

/** What the API sends when a request fails; a bare 500 sends no body at all. */
export interface ApiErrorBody {
  error?: string;
  /** Seconds before trying again, on a 429 from the per-address code cooldown. */
  retryAfter?: number;
}

/** The `pagination` object of every list route. */
export interface Pagination<SortBy extends string = string> {
  limit: number;
  page: number;
  total: number;
  pages: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

/** The query every list route takes (a type, not an interface, so it fits `QueryValues`). */
export type ListQuery<SortBy extends string> = {
  limit: number;
  page: number;
  sortBy: SortBy;
  sortOrder: SortOrder;
};
