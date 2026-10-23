import type { Upload, UploadUsage } from "@/scripts/uploads/upload";

/** An upload as the API returns it; override what a test cares about. */
export const anUpload = (id: string, overrides: Partial<Upload> = {}): Upload => ({
  id,
  originalFileName: `file-${id}.png`,
  extension: ".png",
  mimeType: "image/png",
  fileSize: 2048,
  visibility: "private",
  url: `https://cdn.test/useruploads/user1/${id}.png`,
  uploadedOn: "2026-10-10T12:00:00.000Z",
  updatedOn: "2026-10-10T12:00:00.000Z",
  ...overrides
});

const MB = 1024 * 1024;

/** Usage with room to spare and a small allowlist. */
export const someUsage = (overrides: Partial<UploadUsage> = {}): UploadUsage => ({
  usedBytes: 5 * MB,
  quotaBytes: 100 * MB,
  count: 2,
  maxFileSizeBytes: 10 * MB,
  allowedTypes: [
    { mimeType: "image/png", extension: ".png", category: "image" },
    { mimeType: "image/jpeg", extension: ".jpg", category: "image" },
    { mimeType: "text/plain", extension: ".txt", category: "document" }
  ],
  byCategory: [
    { category: "image", bytes: 4 * MB, count: 1 },
    { category: "video", bytes: 0, count: 0 },
    { category: "audio", bytes: 0, count: 0 },
    { category: "document", bytes: 1 * MB, count: 1 },
    { category: "archive", bytes: 0, count: 0 }
  ],
  ...overrides
});

/** A File of `size` bytes. */
export const aFile = (name: string, size = 1024, type = "image/png") =>
  new File([new Uint8Array(size)], name, { type });
