import { Endpoints } from "@/constants/endpoints";
import { isSuccessStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { apiUrl, errorMessageFrom, noticeSessionRefusal } from "@/scripts/api/client";
import type { BodyOf, ResponseOf } from "@/scripts/api/endpoint";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { formatTime } from "@/scripts/utility/dateUtil";
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

/** A link without its query, e.g. without a private upload's `?expires=…&sig=…` signature. */
export const withoutQuery = (url: string) => url.replace(/[?#].*$/, "");

/**
 * The query parameter of a signed private upload link (vb2007/vb2007.hu-api#361),
 * `…/<id><ext>?expires=<unix s>&sig=…`, with the second it expires; a public link is plain.
 */
const EXPIRES_PARAM = "expires";

/** When a signed private upload link expires, in ms since the epoch, or undefined for a plain one. */
export const linkExpiresAt = (url: string) => {
  const query = url.match(/\?([^#]*)/)?.[1];
  const expires = new URLSearchParams(query).get(EXPIRES_PARAM);
  return expires && /^\d+$/.test(expires) ? Number(expires) * 1000 : undefined;
};

/** Shown after copying a signed link: when that copy expires. "" for a plain link, which doesn't. */
export const copiedLinkNote = (url: string) => {
  const at = linkExpiresAt(url);
  return at === undefined ? "" : `The copied link expires at ${formatTime(at)}.`;
};

/**
 * A link split for display: everything up to the last "/" (without the protocol or a query), and
 * the file part with a long name shortened in the middle (`6712…a3f1.png`). Shown on one line,
 * the head gets cut short while the file part, which tells uploads apart, stays readable.
 */
export const linkParts = (url: string) => {
  const bare = withoutQuery(url).replace(/^https?:\/\//, "");
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
 * A dropped connection is checked against the session first: an ended one rejects with the same
 * `Messages.Auth.notLoggedIn` text the API's own 403 carries.
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
        const error = new UploadError(
          errorMessageFrom(body, request.status, request.statusText, Messages.Uploads.uploadFailed)
        );
        // Like `apiRequest`, an ended session logs the page out before the failure comes back.
        void noticeSessionRefusal(endpoint, request.status, body).finally(() => reject(error));
      }
    };
    // The API answers some uploads before reading their body (an ended session's 403, an
    // over-limit 413) and closes the connection (vb2007/vb2007.hu-api#451, #455). A browser still
    // sending then may report a network error instead of that answer, so ask whether the session
    // is gone. `fetchUserDetails` logs the page out on the API's 403; a lookup that fails any other
    // way leaves `isLoggedIn` alone, and that stays a connection error.
    request.onerror = () =>
      void fetchUserDetails().then((kept) =>
        reject(
          new UploadError(
            !kept && !isLoggedIn.value ? Messages.Auth.notLoggedIn : Messages.connectionError
          )
        )
      );
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
