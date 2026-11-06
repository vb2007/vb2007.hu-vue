import type { ListQuery, MessageResponse, Pagination } from "@/types/api/common";

export type UploadVisibility = "public" | "private";
export type UploadCategory = "image" | "video" | "audio" | "document" | "archive";
export type UploadSortBy = "uploadedOn" | "originalFileName" | "fileSize";

/** An upload as the API returns it (vb2007/vb2007.hu-api#81). */
export interface Upload {
  id: string;
  originalFileName: string;
  /** With the dot, e.g. ".png"; taken from the file's detected type. */
  extension: string;
  mimeType: string;
  /** Bytes. */
  fileSize: number;
  visibility: UploadVisibility;
  /**
   * `cdn.vb2007.hu/useruploads/<userId>/<id><extension>`. A private one is signed for an hour
   * (`?expires=…&sig=…`, see `linkExpiresAt`) and opens for anyone who has it until then.
   */
  url: string;
  uploadedOn: string;
  updatedOn: string;
}

export interface AllowedUploadType {
  mimeType: string;
  extension: string;
  category: UploadCategory;
}

/** `GET /uploads/usage`: the user's storage and the upload rules (vb2007/vb2007.hu-api#86). */
export interface UploadUsage {
  usedBytes: number;
  quotaBytes: number;
  count: number;
  maxFileSizeBytes: number;
  allowedTypes: AllowedUploadType[];
  byCategory: { category: UploadCategory; bytes: number; count: number }[];
}

/** Whose uploads an admin listing shows, or whose one upload is (vb2007/vb2007.hu-api#122). */
export interface UploadOwner {
  id: string;
  username: string;
}

/** `GET /uploads`, `GET /admin/users/:id/uploads` and `GET /admin/uploads` */
export type UploadListQuery = ListQuery<UploadSortBy> & {
  visibility?: UploadVisibility;
  /** Searches the file names, and on `GET /admin/uploads` the owners' usernames too. */
  q?: string;
};

/** `GET /uploads` and `GET /admin/users/:id/uploads` */
export interface UploadsResponse {
  uploads: Upload[];
  pagination: Pagination<UploadSortBy>;
  /** Only the admin's listing says whose uploads they are. */
  user?: UploadOwner;
}

/**
 * `POST /upload`: multipart form fields, not JSON. `visibility` has to come first, since the API
 * reads it while the file streams in.
 */
export interface UploadFileFields {
  visibility: UploadVisibility;
  file: File;
}

/** `PATCH /upload/:id`: either or both. */
export interface UpdateUploadBody {
  originalFileName?: string;
  visibility?: UploadVisibility;
}

/** `GET /upload/:id`: one upload, e.g. for a new signed link. */
export interface UploadResponse {
  upload: Upload;
}

/** `POST /upload` and `PATCH /upload/:id` */
export interface UploadSavedResponse extends MessageResponse {
  upload: Upload;
}

/** `DELETE /upload/:id` */
export interface UploadDeletedResponse extends MessageResponse {
  upload: { id: string };
}
