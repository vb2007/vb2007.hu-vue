import { computed, onBeforeUnmount, ref, type Ref } from "vue";
import { useLatestRequest } from "@/composables/useLatestRequest";
import {
  SIGNED_LINK_REFRESH_LEAD_MS,
  useSignedLinkRefresh
} from "@/composables/useSignedLinkRefresh";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { linkExpiresAt, sendUpload, UploadError, validateFile } from "@/scripts/uploads/upload";
import type { Upload, UploadUsage, UploadVisibility } from "@/types/api/uploads";

export const PARALLEL_UPLOADS = 2;

/**
 * `rejected` is the pre-check saying no (wrong type, too big, over the quota): retrying can't help,
 * unlike `failed`. The pre-check's upload cap refusal is `failed`, since deleting uploads lifts it.
 */
export type QueueStatus = "queued" | "uploading" | "done" | "failed" | "rejected" | "cancelled";

export interface QueueItem {
  id: number;
  file: File;
  visibility: UploadVisibility;
  status: QueueStatus;
  /** 0 to 1. */
  progress: number;
  error: string;
  /** Why a finished private file's link couldn't be renewed; the ticket shows it in its place. */
  linkError: string;
  result: Upload | null;
}

/**
 * Files waiting for, going through or done with an upload. Runs `PARALLEL_UPLOADS` at a time and
 * calls `onUploaded` after each one lands, so the list and the storage meter can refresh, and
 * `onRefused` when the API turns one away with a 409 or 413, so the meter catches up.
 */
export const useUploadQueue = (
  usage: Ref<UploadUsage | null>,
  onUploaded: (upload: Upload) => void,
  onRefused: () => void
) => {
  const items = ref<QueueItem[]>([]);
  const controllers = new Map<number, AbortController>();
  let nextId = 1;

  const find = (id: number) => items.value.find((item) => item.id === id)!;

  /**
   * Files queued or in flight, not counted in `usage` yet.
   * shortcut: one the API stored before its answer arrived counts twice if usage reloads meanwhile; harmless, since the API checks again.
   */
  const pending = () =>
    items.value.filter((item) => item.status === "queued" || item.status === "uploading");

  /** `validateFile` with what's pending counted against the quota and the upload cap. */
  const check = (file: File) => {
    const files = pending();
    const bytes = files.reduce((sum, item) => sum + item.file.size, 0);
    return validateFile(file, usage.value, bytes, files.length);
  };

  /** What a pre-check's answer makes of a file. */
  const statusFor = (error: string): QueueStatus => {
    if (!error) return "queued";
    const atCap = usage.value && error === Messages.Uploads.tooManyUploads(usage.value.maxCount);
    return atCap ? "failed" : "rejected";
  };

  const run = async (id: number) => {
    const item = find(id);
    const controller = new AbortController();
    controllers.set(id, controller);
    item.status = "uploading";
    item.progress = 0;
    item.error = "";
    try {
      item.result = await sendUpload(
        item.file,
        item.visibility,
        (fraction) => (find(id).progress = fraction),
        controller.signal
      );
      item.status = "done";
      onUploaded(item.result);
    } catch (error) {
      const cancelled = error instanceof UploadError && error.cancelled;
      item.status = cancelled ? "cancelled" : "failed";
      item.error = cancelled ? "" : (error as Error).message;
      const { status } = error as UploadError;
      if (status === HttpStatus.Conflict || status === HttpStatus.ContentTooLarge) onRefused();
    } finally {
      controllers.delete(id);
      pump();
    }
  };

  /** Starts queued files while there's room. */
  const pump = () => {
    const running = items.value.filter((item) => item.status === "uploading").length;
    items.value
      .filter((item) => item.status === "queued")
      .slice(0, Math.max(0, PARALLEL_UPLOADS - running))
      .forEach((item) => run(item.id));
  };

  const add = (files: Iterable<File>, visibility: UploadVisibility) => {
    for (const file of files) {
      const error = check(file);
      items.value.push({
        id: nextId++,
        file,
        visibility,
        status: statusFor(error),
        progress: 0,
        error,
        result: null,
        linkError: ""
      });
    }
    pump();
  };

  const cancel = (id: number) => {
    const item = find(id);
    if (item.status === "uploading") {
      controllers.get(id)!.abort();
    } else if (item.status === "queued") {
      item.status = "cancelled";
    }
  };

  /** Tries a failed or cancelled file again, re-checking it first. */
  const retry = (id: number) => {
    const item = find(id);
    const error = check(item.file);
    item.error = error;
    item.status = statusFor(error);
    pump();
  };

  /** Takes one finished, failed or rejected file off the list. */
  const dismiss = (id: number) => {
    items.value = items.value.filter((item) => item.id !== id);
  };

  const clearFinished = () => {
    items.value = items.value.filter(
      (item) => item.status === "queued" || item.status === "uploading"
    );
  };

  const hasFinished = computed(() =>
    items.value.some((item) => item.status !== "queued" && item.status !== "uploading")
  );

  onBeforeUnmount(() => controllers.forEach((controller) => controller.abort()));

  /** Finished private files, whose signed links expire; not the ones that can't be renewed. */
  const signed = () =>
    items.value.filter(
      (item) =>
        item.status === "done" && !item.linkError && linkExpiresAt(item.result!.url) !== undefined
    );

  /**
   * Asks for one ticket's link again. Resolves to whether that's settled: renewed, or refused for
   * good (the file is gone, or no longer the user's to ask for). A dropped connection isn't.
   */
  const renew = async (item: QueueItem, signal: AbortSignal) => {
    const result = await apiRequest(Endpoints.Uploads.get, {
      params: { id: item.result!.id },
      failure: Messages.Uploads.renewLinkFailed,
      signal,
      quietStatuses: [HttpStatus.NotFound]
    });
    if (signal.aborted) return false;
    if (result.ok) {
      item.result = result.data.upload;
      return true;
    }
    if (result.kind !== "http") return false;
    if (result.status === HttpStatus.NotFound) {
      item.linkError = Messages.Uploads.linkFileDeleted;
    } else if (result.status === HttpStatus.Forbidden) {
      item.linkError = Messages.Uploads.linkNotRenewed;
    } else {
      return false;
    }
    return true;
  };

  // Each ticket keeps a working link: the ones due are asked for again, until all of them settle.
  const latest = useLatestRequest();
  useSignedLinkRefresh(
    () => signed().map((item) => item.result!.url),
    async () => {
      const signal = latest.next();
      const due = signed().filter(
        (item) => linkExpiresAt(item.result!.url)! - SIGNED_LINK_REFRESH_LEAD_MS <= Date.now()
      );
      const settled = await Promise.all(due.map((item) => renew(item, signal)));
      return settled.every(Boolean);
    }
  );

  return { items, hasFinished, add, cancel, retry, dismiss, clearFinished };
};
