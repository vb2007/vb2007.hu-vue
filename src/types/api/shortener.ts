import type { MessageResponse } from "@/types/api/common";

/** A short link as `POST /shortenUrl/create` returns it. */
export interface ShortUrl {
  /** The short code, not a full URL. */
  shortenedUrl: string;
  originalUrl: string;
  addedOn: string;
  /** The creator's user ID. */
  addedBy: string;
}

/** `POST /shortenUrl/create` */
export interface ShortenUrlBody {
  url: string;
}

/** `POST /shortenUrl/create`: 201 for a new link, 200 when the URL was already shortened. */
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
