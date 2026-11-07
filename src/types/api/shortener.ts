import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";

/** A short link as `POST /shortenUrl` returns it. */
export interface ShortUrl {
  /** The short code, not a full URL. */
  shortenedUrl: string;
  originalUrl: string;
  addedOn: string;
  /** The creator's user ID. */
  addedBy: string;
}

/** `POST /shortenUrl` */
export interface ShortenUrlBody {
  url: string;
}

/**
 * `POST /shortenUrl`: 201 for a new link, 200 with their existing link when this user already
 * shortened the URL (vb2007/vb2007.hu-api#247).
 */
export interface ShortenUrlResponse extends MessageResponse {
  data: ShortUrl;
}

/** The sharer, populated by the lookup; null once their account is gone. */
export interface ShortUrlSharer {
  _id: string;
  username: string;
  createdAt?: string;
}

/** `GET /shortenUrl/:shortenedUrl` (vb2007/vb2007.hu-api#75); older APIs leave the sharer out. */
export interface ShortUrlLookupResponse {
  originalUrl: string;
  addedBy?: ShortUrlSharer | null;
  addedOn?: string;
}

export type ShortUrlSortBy = "addedOn";

/** `GET /shortenUrls` (vb2007/vb2007.hu-api#285) */
export type ShortUrlListQuery = ListQuery<ShortUrlSortBy> & {
  /** Matches part of the code or the target, whatever its case. */
  q?: string;
};

/** A row of `GET /shortenUrls`: a `ShortUrl` without its owner, who is the logged-in user. */
export type OwnShortUrl = Omit<ShortUrl, "addedBy">;

/** `GET /shortenUrls`; a page past the end answers an empty list. */
export interface ShortUrlsResponse {
  shortUrls: OwnShortUrl[];
  pagination: Pagination<ShortUrlSortBy>;
}
