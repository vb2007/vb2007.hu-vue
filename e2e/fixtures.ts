import { test as base, expect, type Route } from "@playwright/test";

/**
 * Stand-in for the vb2007.hu API. Every request that doesn't go to the preview server is routed
 * here and answered by pathname, so it works whatever API host the app was built against.
 *
 * A test arranges state through the helpers (`api.loggedInAs(...)`, `api.shortenReturns(...)`,
 * `api.hasShortLink(...)`, `api.hasPaste(...)`, `api.hasUpload(...)`, `api.quotaIs(...)`,
 * `api.hasUser(...)`) before navigating; `hasUpload(..., { owner })` files an upload under another
 * username, for the admin's view of that user's uploads; `api.loggedInAs(..., { superuser: true })` opens the admin page; `{ githubLinked: true }` links GitHub.
 * Upload links point at a cdn host this mock also answers, with a tiny PNG for every file. For a one-off response, register `page.route(...)` in the test itself:
 * routes added later take precedence over this one.
 *
 * Requests this mock doesn't know are aborted and fail the test at teardown, so e2e runs can
 * never reach a real server. Add a case to `respond` when the app starts calling a new endpoint.
 */
export interface MockPaste {
  _id: string;
  content: string;
  addedBy: string;
  addedOn: string;
  /** A highlight.js id (vb2007/vb2007.hu-api#123); left out for pastes from before it. */
  language?: string;
}

export interface MockUpload {
  id: string;
  originalFileName: string;
  extension: string;
  mimeType: string;
  fileSize: number;
  visibility: "public" | "private";
  url: string;
  uploadedOn: string;
  updatedOn: string;
}

/** A user as the admin list returns them (vb2007/vb2007.hu-api#120). */
export interface MockAdminUser {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  isSuperuser: boolean;
  uploads: { usedBytes: number; count: number; quotaBytes: number; hasCustomQuota: boolean };
}

type UploadCategory = "image" | "video" | "audio" | "document" | "archive";

/** A subset of the API's allowlist (vb2007/vb2007.hu-api#82), enough for the e2e files. */
const ALLOWED_TYPES: { mimeType: string; extension: string; category: UploadCategory }[] = [
  { mimeType: "image/png", extension: ".png", category: "image" },
  { mimeType: "image/jpeg", extension: ".jpg", category: "image" },
  { mimeType: "video/mp4", extension: ".mp4", category: "video" },
  { mimeType: "audio/mpeg", extension: ".mp3", category: "audio" },
  { mimeType: "application/pdf", extension: ".pdf", category: "document" },
  { mimeType: "text/plain", extension: ".txt", category: "document" },
  { mimeType: "application/zip", extension: ".zip", category: "archive" }
];
const CATEGORIES: UploadCategory[] = ["image", "video", "audio", "document", "archive"];
const MB = 1024 * 1024;
const DEFAULT_QUOTA = 10 * 1024 * MB;

/** 1×1 PNG served for every cdn file, so thumbnails and previews load. */
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk2Lb3PwAEtwJBEP5yGQAAAABJRU5ErkJggg==",
  "base64"
);

/** The `visibility` field and the file part of a multipart upload body. */
const parseMultipart = (body: Buffer, contentType: string) => {
  const boundary = contentType.match(/boundary=(.+)$/)![1];
  const parts = body.toString("latin1").split(`--${boundary}`);
  const field = (name: string) =>
    parts.find((part) => part.includes(`name="${name}"`))?.split("\r\n\r\n")[1];
  const filePart = parts.find((part) => part.includes('name="file"')) ?? "";
  const [headers, ...content] = filePart.split("\r\n\r\n");
  return {
    visibility: field("visibility")?.replace(/\r\n$/, ""),
    fileName: headers.match(/filename="([^"]*)"/)?.[1] ?? "",
    mimeType: headers.match(/Content-Type: (\S+)/i)?.[1] ?? "",
    // The part ends with CRLF before the next boundary.
    size: Math.max(0, content.join("\r\n\r\n").length - 2)
  };
};

export class MockApi {
  private user: {
    email: string;
    username: string;
    isSuperuser: boolean;
    githubId?: string;
  } | null = null;
  private shortCode = "e2e123";
  /** Short code -> link, filled by shortening and by `hasShortLink`. */
  readonly shortLinks = new Map<string, { target: string; addedBy: string; addedOn: string }>();
  /** In-memory paste store, oldest first. */
  readonly pastes: MockPaste[] = [];
  private nextPasteId = 1;
  /** In-memory upload store, oldest first. */
  readonly uploads: MockUpload[] = [];
  /** Upload id -> the username it belongs to. */
  private readonly uploadOwners = new Map<string, string>();
  private nextUploadId = 1;
  private quotaBytes = DEFAULT_QUOTA;
  /** Accounts the admin page lists, oldest first. */
  readonly users: MockAdminUser[] = [];
  private cdnOrigin = "https://cdn.e2e.invalid";
  readonly unhandled: string[] = [];

  loggedOut() {
    this.user = null;
  }

  loggedInAs(
    email = "e2e@example.com",
    username = "e2e",
    { superuser = false, githubLinked = false } = {}
  ) {
    this.user = { email, username, isSuperuser: superuser };
    if (githubLinked) this.user.githubId = "583231";
  }

  /** Adds an account to the admin list; `quotaBytes` makes it a custom quota. */
  hasUser(
    username: string,
    {
      usedBytes = 0,
      count = 0,
      quotaBytes
    }: { usedBytes?: number; count?: number; quotaBytes?: number } = {}
  ) {
    const user: MockAdminUser = {
      id: `${this.users.length + 1}`.padStart(24, "b"),
      username,
      email: `${username}@example.com`,
      // Each account is a day newer than the last, so sorting by date is deterministic.
      createdAt: new Date(Date.UTC(2026, 0, 1 + this.users.length)).toISOString(),
      isSuperuser: false,
      uploads: {
        usedBytes,
        count,
        quotaBytes: quotaBytes ?? DEFAULT_QUOTA,
        hasCustomQuota: quotaBytes !== undefined
      }
    };
    this.users.push(user);
    return user;
  }

  /** Stores a paste as if `username` had created it, in `language` if given, and returns it. */
  hasPaste(content: string, username = "e2e", language?: string) {
    const id = `${this.nextPasteId++}`.padStart(24, "0");
    // Each paste is a minute newer than the last, so sorting by date is deterministic.
    const addedOn = new Date(Date.UTC(2026, 9, 10, 12, this.pastes.length)).toISOString();
    const paste: MockPaste = { _id: id, content, addedBy: username, addedOn };
    if (language) paste.language = language;
    this.pastes.push(paste);
    return paste;
  }

  /** Stores an upload as if the logged-in user (or `owner`) had sent it, and returns it. */
  hasUpload(
    originalFileName: string,
    {
      fileSize = 2048,
      visibility = "private" as MockUpload["visibility"],
      owner = this.user?.username ?? "e2e"
    } = {}
  ) {
    const extension = originalFileName.slice(originalFileName.lastIndexOf(".")).toLowerCase();
    const type = ALLOWED_TYPES.find((allowed) => allowed.extension === extension)!;
    const id = `${this.nextUploadId++}`.padStart(24, "0");
    // Each upload is a minute newer than the last, so sorting by date is deterministic.
    const uploadedOn = new Date(Date.UTC(2026, 9, 10, 12, this.uploads.length)).toISOString();
    const upload: MockUpload = {
      id,
      originalFileName,
      extension,
      mimeType: type.mimeType,
      fileSize,
      visibility,
      url: `${this.cdnOrigin}/useruploads/${"a".repeat(24)}/${id}${extension}`,
      uploadedOn,
      updatedOn: uploadedOn
    };
    this.uploads.push(upload);
    this.uploadOwners.set(id, owner);
    return upload;
  }

  quotaIs(bytes: number) {
    this.quotaBytes = bytes;
  }

  shortenReturns(code: string) {
    this.shortCode = code;
  }

  hasShortLink(code: string, target: string, addedBy = "e2e") {
    this.shortLinks.set(code, { target, addedBy, addedOn: "2026-10-10T12:00:00.000Z" });
  }

  async handle(route: Route, appOrigin: string) {
    const request = route.request();
    // The app calls the API cross-origin with credentials, so every answer needs CORS headers.
    const headers = {
      "Access-Control-Allow-Origin": appOrigin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS"
    };
    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers });
    }

    const url = new URL(request.url());
    if (url.origin === this.cdnOrigin && url.pathname.startsWith("/useruploads/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    }

    const contentType = (await request.headerValue("content-type")) ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const response = this.receiveUpload(parseMultipart(request.postDataBuffer()!, contentType));
      return route.fulfill({ status: response.status, headers, json: response.body });
    }

    const response = this.respond(
      `${request.method()} ${url.pathname}`,
      request.postDataJSON(),
      url.searchParams
    );
    if (!response) {
      this.unhandled.push(`${request.method()} ${request.url()}`);
      return route.abort();
    }
    if (response.location) {
      return route.fulfill({ status: response.status, headers: { location: response.location } });
    }
    return route.fulfill({ status: response.status, headers, json: response.body ?? {} });
  }

  private respond(
    endpoint: string,
    body: {
      email?: string;
      paste?: string;
      language?: string;
      originalFileName?: string;
      visibility?: MockUpload["visibility"];
      quotaBytes?: number | null;
    } | null,
    query: URLSearchParams
  ): { status: number; body?: unknown; location?: string } | undefined {
    const lookupRoute = endpoint.match(/^GET \/shortenUrl\/([^/]+)$/);
    if (lookupRoute) {
      const link = this.shortLinks.get(decodeURIComponent(lookupRoute[1]));
      // Shaped like the real API, which also populates the sharer's account.
      return link
        ? {
            status: 200,
            body: {
              originalUrl: link.target,
              addedBy: { _id: "u1", username: link.addedBy, createdAt: "2026-07-31T17:16:07.516Z" },
              addedOn: link.addedOn
            }
          }
        : { status: 404, body: { error: "The shortened URL cannot be found." } };
    }
    const redirectRoute = endpoint.match(/^GET \/r\/([^/]+)$/);
    if (redirectRoute) {
      const link = this.shortLinks.get(decodeURIComponent(redirectRoute[1]));
      return link
        ? { status: 302, location: link.target }
        : { status: 404, body: { error: "The shortened URL cannot be found." } };
    }
    const pasteRoute = endpoint.match(/^(GET|PATCH|DELETE) \/paste\/([^/]+)$/);
    if (pasteRoute) {
      return this.respondPaste(pasteRoute[1], decodeURIComponent(pasteRoute[2]), body?.language);
    }
    const listRoute = endpoint.match(/^GET \/pastes\/([^/]+)$/);
    if (listRoute) {
      return this.listPastes(decodeURIComponent(listRoute[1]), query);
    }

    const uploadRoute = endpoint.match(/^(PATCH|DELETE) \/upload\/([^/]+)$/);
    if (uploadRoute) {
      return this.editUpload(uploadRoute[1], decodeURIComponent(uploadRoute[2]), body);
    }

    const userUploadsRoute = endpoint.match(/^GET \/admin\/users\/([^/]+)\/uploads$/);
    if (userUploadsRoute) {
      return this.listUserUploads(decodeURIComponent(userUploadsRoute[1]), query);
    }
    const quotaRoute = endpoint.match(/^PATCH \/admin\/users\/([^/]+)\/upload-quota$/);
    if (quotaRoute) {
      return this.setQuota(decodeURIComponent(quotaRoute[1]), body?.quotaBytes);
    }

    switch (endpoint) {
      case "GET /admin/users":
        return this.listUsers(query);
      case "GET /uploads":
        return this.listUploads(query, this.user?.username);
      case "GET /uploads/usage":
        return this.usage();
      case "GET /user":
        return this.user ? { status: 200, body: this.user } : { status: 401 };
      case "POST /auth/login":
        this.user = {
          email: body?.email ?? "e2e@example.com",
          username: "e2e",
          isSuperuser: false
        };
        return { status: 200 };
      case "POST /auth/logout":
        this.user = null;
        return { status: 200 };
      case "POST /auth/register":
        return { status: 201 };
      case "POST /shortenUrl/create":
        this.hasShortLink(
          this.shortCode,
          (body as { url?: string } | null)?.url ?? "",
          this.user?.username
        );
        return { status: 200, body: { data: { shortenedUrl: this.shortCode } } };
      case "POST /paste":
        if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
        return {
          status: 201,
          body: {
            message: "Paste created successfully.",
            paste: this.hasPaste(body?.paste ?? "", this.user.username, body?.language)
          }
        };
      default:
        return undefined;
    }
  }

  private respondPaste(method: string, id: string, language?: string) {
    if (!/^[0-9a-f]{24}$/.test(id)) {
      return { status: 400, body: { error: "Invalid ID format." } };
    }
    const index = this.pastes.findIndex((paste) => paste._id === id);
    if (index === -1) {
      return { status: 404, body: { error: "There is no such paste with that ID." } };
    }
    const paste = this.pastes[index];
    if (method === "GET") {
      // Populated like the real API does since vb2007/vb2007.hu-api#124.
      return {
        status: 200,
        body: { paste: { ...paste, addedBy: { _id: "u1", username: paste.addedBy } } }
      };
    }
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    if (method === "PATCH") {
      if (paste.addedBy !== this.user.username && !this.user.isSuperuser) {
        return { status: 403, body: { error: "You are not authorized." } };
      }
      if (!/^[a-z0-9+#-]{1,32}$/.test(language ?? "")) {
        return { status: 400, body: { error: "That isn't a valid language." } };
      }
      paste.language = language;
      return { status: 200, body: { message: "Paste updated successfully.", paste } };
    }
    const [deleted] = this.pastes.splice(index, 1);
    return { status: 200, body: { message: "Paste deleted successfully.", paste: deleted } };
  }

  private usedBytes() {
    return this.uploads.reduce((sum, upload) => sum + upload.fileSize, 0);
  }

  private usage() {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const categoryOf = (upload: MockUpload) =>
      ALLOWED_TYPES.find((type) => type.mimeType === upload.mimeType)!.category;
    return {
      status: 200,
      body: {
        usedBytes: this.usedBytes(),
        quotaBytes: this.quotaBytes,
        count: this.uploads.length,
        maxFileSizeBytes: 100 * MB,
        allowedTypes: ALLOWED_TYPES,
        byCategory: CATEGORIES.map((category) => {
          const inCategory = this.uploads.filter((upload) => categoryOf(upload) === category);
          return {
            category,
            bytes: inCategory.reduce((sum, upload) => sum + upload.fileSize, 0),
            count: inCategory.length
          };
        })
      }
    };
  }

  private receiveUpload(part: ReturnType<typeof parseMultipart>) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const extension = part.fileName.slice(part.fileName.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_TYPES.some((type) => type.extension === extension)) {
      return { status: 415, body: { error: "This file type isn't supported." } };
    }
    if (this.usedBytes() + part.size > this.quotaBytes) {
      return { status: 413, body: { error: "This upload would go over your storage quota." } };
    }
    const upload = this.hasUpload(part.fileName, {
      fileSize: part.size,
      visibility: part.visibility === "public" ? "public" : "private"
    });
    return { status: 201, body: { message: "File uploaded successfully.", upload } };
  }

  private editUpload(
    method: string,
    id: string,
    body: { originalFileName?: string; visibility?: MockUpload["visibility"] } | null
  ) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const index = this.uploads.findIndex((upload) => upload.id === id);
    if (index === -1) return { status: 404, body: { error: "There is no such upload." } };
    if (method === "DELETE") {
      this.uploads.splice(index, 1);
      return { status: 200, body: { message: "Upload deleted successfully.", upload: { id } } };
    }
    const upload = this.uploads[index];
    Object.assign(upload, body, { updatedOn: "2026-10-11T08:30:00.000Z" });
    return { status: 200, body: { message: "Upload updated successfully.", upload } };
  }

  /** The admin's view of one user's uploads: the same listing, plus whose they are. */
  private listUserUploads(id: string, query: URLSearchParams) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user." } };
    const listing = this.listUploads(query, user.username);
    return {
      ...listing,
      body: { ...listing.body, user: { id: user.id, username: user.username } }
    };
  }

  private listUploads(query: URLSearchParams, owner: string | undefined) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = (query.get("sortBy") ?? "uploadedOn") as keyof MockUpload;
    const sortOrder = query.get("sortOrder") ?? "desc";
    const visibility = query.get("visibility");
    const q = query.get("q")?.toLowerCase();
    const matching = this.uploads
      .filter((upload) => this.uploadOwners.get(upload.id) === owner)
      .filter((upload) => !visibility || upload.visibility === visibility)
      .filter((upload) => !q || upload.originalFileName.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = String(a[sortBy]).localeCompare(String(b[sortBy]), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        uploads: matching.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy,
          sortOrder
        }
      }
    };
  }

  private listUsers(query: URLSearchParams) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const limit = Number(query.get("limit") ?? 20);
    const page = Number(query.get("page") ?? 1);
    const sortBy = query.get("sortBy") ?? "usedBytes";
    const sortOrder = query.get("sortOrder") ?? "desc";
    const q = query.get("q")?.toLowerCase();
    const value = (user: MockAdminUser) =>
      sortBy === "usedBytes" ? String(user.uploads.usedBytes) : String(user[sortBy as "username"]);
    const matching = this.users
      .filter((user) => !q || user.username.toLowerCase().includes(q))
      .sort((a, b) => {
        const order = value(a).localeCompare(value(b), "en", { numeric: true });
        return sortOrder === "asc" ? order : -order;
      });
    return {
      status: 200,
      body: {
        users: matching.slice((page - 1) * limit, page * limit),
        pagination: {
          limit,
          page,
          total: matching.length,
          pages: Math.ceil(matching.length / limit),
          sortBy,
          sortOrder
        }
      }
    };
  }

  private setQuota(id: string, quotaBytes: number | null | undefined) {
    if (!this.user?.isSuperuser) {
      return { status: 403, body: { error: "You do not have permission to perform this action." } };
    }
    const user = this.users.find((item) => item.id === id);
    if (!user) return { status: 404, body: { error: "There is no such user." } };
    if (quotaBytes !== null && !Number.isInteger(quotaBytes)) {
      return { status: 400, body: { error: "The quota must be a whole number of bytes or null." } };
    }
    user.uploads.quotaBytes = quotaBytes ?? DEFAULT_QUOTA;
    user.uploads.hasCustomQuota = quotaBytes !== null;
    return { status: 200, body: { message: "Upload quota updated.", user } };
  }

  private listPastes(username: string, query: URLSearchParams) {
    if (!this.user) return { status: 403, body: { error: "You are not logged in." } };
    const limit = Number(query.get("limit") ?? 10);
    const page = Number(query.get("page") ?? 1);
    const sortOrder = query.get("sortOrder") ?? "desc";
    const owned = this.pastes.filter((paste) => paste.addedBy === username);
    const sorted = sortOrder === "asc" ? owned : [...owned].reverse();
    return {
      status: 200,
      body: {
        pastes: sorted
          .slice((page - 1) * limit, page * limit)
          .map((paste) => ({ ...paste, addedBy: { _id: "u1", username } })),
        pagination: {
          limit,
          page,
          total: owned.length,
          pages: Math.ceil(owned.length / limit),
          sortBy: "addedOn",
          sortOrder
        }
      }
    };
  }
}

export const test = base.extend<{ api: MockApi }>({
  api: [
    async ({ page, baseURL }, use) => {
      const appOrigin = new URL(baseURL!).origin;
      const api = new MockApi();
      await page.route(
        (url) => url.origin !== appOrigin,
        (route) => api.handle(route, appOrigin)
      );

      await use(api);

      expect(api.unhandled, "requests the e2e API mock does not handle").toEqual([]);
    },
    // Auto: every test gets the mock, even one that never touches `api` directly.
    { auto: true }
  ]
});

export { expect };
