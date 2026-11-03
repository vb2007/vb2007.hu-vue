import { Endpoints } from "@/constants/endpoints";
import { isSuccessStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiUrl, errorMessageFrom } from "@/scripts/api/client";
import type { BodyOf, ResponseOf } from "@/scripts/api/endpoint";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import type {
  AllowedUploadType,
  Upload,
  UploadCategory,
  UploadUsage,
  UploadVisibility
} from "@/types/api/uploads";

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
    return Messages.Uploads.emptyFile;
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
    return Messages.Uploads.unsupportedType;
  }
  if (file.size > usage.maxFileSizeBytes) {
    return Messages.Uploads.tooLarge(formatBytes(usage.maxFileSizeBytes));
  }
  if (usage.usedBytes + pendingBytes + file.size > usage.quotaBytes) {
    return Messages.Uploads.quotaExceeded;
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

/** `readJson` for an XMLHttpRequest: the parsed body, or null when there's none. */
const readXhrJson = (request: XMLHttpRequest): unknown => {
  try {
    return JSON.parse(request.responseText);
  } catch {
    return null;
  }
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
    const endpoint = Endpoints.Uploads.upload;
    const request = new XMLHttpRequest();
    request.open(endpoint.method, apiUrl(endpoint));
    request.withCredentials = endpoint.credentials;

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      const body = readXhrJson(request);
      // Like `apiRequest`, a success without a JSON body counts as a failure.
      if (isSuccessStatus(request.status) && body !== null) {
        onProgress(1);
        resolve((body as ResponseOf<typeof endpoint>).upload);
      } else {
        reject(
          new UploadError(
            errorMessageFrom(
              body,
              request.status,
              request.statusText,
              Messages.Uploads.uploadFailed
            )
          )
        );
      }
    };
    request.onerror = () => reject(new UploadError(Messages.connectionError));
    request.onabort = () => reject(new UploadError(Messages.Uploads.cancelled, true));
    signal?.addEventListener("abort", () => request.abort(), { once: true });

    // The API reads `visibility` while the file streams in, so it has to come first.
    const fields: BodyOf<typeof endpoint> = { visibility, file };
    const body = new FormData();
    body.append("visibility", fields.visibility);
    body.append("file", fields.file);
    request.send(body);
  });

/** Why a new display name is rejected, or "" when it's fine; the same rules as the API. */
export const validateFileName = (name: string) => {
  const { minLength, maxLength, forbiddenCharacters } = Limits.FileName;
  const trimmed = name.trim();
  if (
    trimmed.length < minLength ||
    trimmed.length > maxLength ||
    forbiddenCharacters.test(trimmed)
  ) {
    return Messages.Uploads.invalidFileName(minLength, maxLength);
  }
  return "";
};
