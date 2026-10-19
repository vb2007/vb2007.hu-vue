import { UserUploads } from "@/constants/api";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import type { SortOrder } from "@/scripts/pastebin/paste";

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
  /** `cdn.vb2007.hu/useruploads/<userId>/<id><extension>`; private ones only open for the owner. */
  url: string;
  uploadedOn: string;
  updatedOn: string;
}

export interface AllowedUploadType {
  mimeType: string;
  extension: string;
  category: UploadCategory;
}

/** The user's storage and the upload rules (vb2007/vb2007.hu-api#86). */
export interface UploadUsage {
  usedBytes: number;
  quotaBytes: number;
  count: number;
  maxFileSizeBytes: number;
  allowedTypes: AllowedUploadType[];
  byCategory: { category: UploadCategory; bytes: number; count: number }[];
}

export type { SortOrder };

/** Plural labels, in the order the API lists categories. */
export const CATEGORY_LABELS: Record<UploadCategory, string> = {
  image: "Images",
  video: "Videos",
  audio: "Audio",
  document: "Documents",
  archive: "Archives"
};

/** Which category a MIME type falls in, for icons and previews. */
export const categoryOf = (mimeType: string): UploadCategory => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (/zip|7z|tar|gzip/.test(mimeType)) return "archive";
  return "document";
};

/**
 * A link split for display: everything up to the last "/" (without the protocol), and the file
 * part with a long name shortened in the middle (`6712…a3f1.png`). Shown on one line, the head
 * gets cut short while the file part, which tells uploads apart, stays readable.
 */
export const linkParts = (url: string) => {
  const bare = url.replace(/^https?:\/\//, "");
  const cut = bare.lastIndexOf("/") + 1;
  const file = bare.slice(cut);
  const dot = file.lastIndexOf(".");
  const name = dot > 0 ? file.slice(0, dot) : file;
  const extension = dot > 0 ? file.slice(dot) : "";
  const short = name.length > 12 ? `${name.slice(0, 4)}…${name.slice(-4)}` : name;
  return { head: bare.slice(0, cut), tail: short + extension };
};

/** The extension shown as the file's type, e.g. "PNG". */
export const typeLabel = (extension: string) => extension.replace(/^\./, "").toUpperCase();

/** The `accept` attribute for the file picker, e.g. ".png,.jpg,image/png,image/jpeg". */
export const acceptFor = (types: AllowedUploadType[]) =>
  [...new Set(types.flatMap((type) => [type.extension, type.mimeType]))].join(",");

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot).toLowerCase() : "";
};

/**
 * Why a file can't be uploaded, or "" when it can. The API checks the real contents again;
 * this only catches what's obvious up front. `pendingBytes` is what's already queued.
 */
export const validateFile = (file: File, usage: UploadUsage | null, pendingBytes = 0) => {
  if (file.size === 0) {
    return "This file is empty.";
  }
  if (!usage) {
    return "";
  }
  const extension = extensionOf(file.name);
  const known = usage.allowedTypes.some(
    (type) =>
      type.mimeType === file.type ||
      type.extension === extension ||
      // .jpeg is stored as .jpg
      (extension === ".jpeg" && type.extension === ".jpg")
  );
  if (!known) {
    return "This file type isn't supported.";
  }
  if (file.size > usage.maxFileSizeBytes) {
    return `The file is larger than the ${formatBytes(usage.maxFileSizeBytes)} limit.`;
  }
  if (usage.usedBytes + pendingBytes + file.size > usage.quotaBytes) {
    return "This upload would go over your storage quota.";
  }
  return "";
};

export class UploadError extends Error {
  constructor(
    message: string,
    readonly cancelled = false
  ) {
    super(message);
  }
}

const messageFrom = (request: XMLHttpRequest) => {
  try {
    const data = JSON.parse(request.responseText);
    if (data.error) return data.error as string;
  } catch {
    // Not JSON; fall back to the status below.
  }
  return `Upload failed: ${request.statusText || request.status}`;
};

/**
 * Sends one file as multipart form data. Uses XMLHttpRequest because fetch can't report upload
 * progress. Rejects with an `UploadError` carrying the API's message, or `cancelled` on abort.
 */
export const sendUpload = (
  file: File,
  visibility: UploadVisibility,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal
) =>
  new Promise<Upload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", UserUploads.upload);
    request.withCredentials = true;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve(JSON.parse(request.responseText).upload as Upload);
      } else {
        reject(new UploadError(messageFrom(request)));
      }
    };
    request.onerror = () => reject(new UploadError("Error connecting to server"));
    request.onabort = () => reject(new UploadError("Cancelled", true));
    signal?.addEventListener("abort", () => request.abort(), { once: true });

    // The API reads `visibility` while the file streams in, so it has to come first.
    const body = new FormData();
    body.append("visibility", visibility);
    body.append("file", file);
    request.send(body);
  });

export const FILE_NAME_MAX_LENGTH = 255;

/** Why a new display name is rejected, or "" when it's fine; the same rules as the API. */
export const validateFileName = (name: string) => {
  const trimmed = name.trim();
  if (
    !trimmed ||
    trimmed.length > FILE_NAME_MAX_LENGTH ||
    /[/\\\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return `File names must be 1–${FILE_NAME_MAX_LENGTH} characters, without slashes or control characters.`;
  }
  return "";
};
