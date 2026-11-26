import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";

/** A paste as the API returns it. */
export interface Paste {
  _id: string;
  content: string;
  /** Null once the account is gone. */
  addedBy: { _id: string; username: string } | null;
  addedOn: string;
  /** A PASTE_LANGUAGES id (vb2007/vb2007.hu-api#123); pastes from before it have none. */
  language?: string;
}

export type PasteSortBy = "addedOn";

/** `GET /pastes/:username` */
export type PasteListQuery = ListQuery<PasteSortBy>;

/** `GET /pastes/:username` */
export interface PastesResponse {
  pastes: Paste[];
  pagination: Pagination<PasteSortBy>;
}

/** `GET /paste/:id` */
export interface PasteResponse {
  paste: Paste;
}

/** `POST /paste` and `PATCH /paste/:id` */
export interface PasteSavedResponse extends MessageResponse {
  paste: Paste;
}

/** `DELETE /paste/:id` */
export interface PasteDeletedResponse extends MessageResponse {
  paste: { _id: string };
}

/** `POST /paste` */
export interface CreatePasteBody {
  paste: string;
  language: string;
}

/** `PATCH /paste/:id` (vb2007/vb2007.hu-api#124) */
export interface UpdatePasteBody {
  language: string;
}
