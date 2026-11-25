import type { ApiKeyScope } from "@/types/api/apiKeys";

/** One of the API's three uploaders, `GET /sharex/<id>.sxcu`. */
export type SharexUploaderId = "upload" | "paste" | "shorten";

/** The ShareX uploaders (vb2007/vb2007.hu-api#573), mirroring the API's `helpers/sharex.ts`. */
export class Sharex {
  /** What the files' `Authorization` header holds until the key's token replaces it. */
  static readonly tokenPlaceholder: string = "vbk_YOUR_TOKEN";
  /** The key the page creates: the scopes the three files need, and nothing else. */
  static readonly keyName: string = "ShareX";
  static readonly keyScopes: readonly ApiKeyScope[] = [
    "uploads:write",
    "pastes:write",
    "shortUrls:write"
  ];
  /** Each file's uploader as ShareX lists it, and the Destinations slots to pick it for. */
  static readonly uploaders: readonly { id: SharexUploaderId; name: string; slots: string[] }[] = [
    { id: "upload", name: "vb2007.hu upload", slots: ["Image uploader", "File uploader"] },
    { id: "paste", name: "vb2007.hu paste", slots: ["Text uploader"] },
    { id: "shorten", name: "vb2007.hu shortener", slots: ["URL shortener"] }
  ];
  /** The API's `Content-Disposition` name, which CORS doesn't expose to the site. */
  static fileName(id: SharexUploaderId): string {
    return `vb2007-${id}.sxcu`;
  }
}
