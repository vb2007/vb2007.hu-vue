import { computed, onBeforeUnmount, ref, type Ref } from "vue";
import {
  sendUpload,
  UploadError,
  validateFile,
  type Upload,
  type UploadUsage,
  type UploadVisibility
} from "@/scripts/uploads/upload";

export const PARALLEL_UPLOADS = 2;

/** `rejected` is the pre-check saying no (wrong type, too big): retrying can't help, unlike `failed`. */
export type QueueStatus = "queued" | "uploading" | "done" | "failed" | "rejected" | "cancelled";

export interface QueueItem {
  id: number;
  file: File;
  visibility: UploadVisibility;
  status: QueueStatus;
  /** 0 to 1. */
  progress: number;
  error: string;
  result: Upload | null;
}

/**
 * Files waiting for, going through or done with an upload. Runs `PARALLEL_UPLOADS` at a time and
 * calls `onUploaded` after each one lands, so the list and the storage meter can refresh.
 */
export const useUploadQueue = (
  usage: Ref<UploadUsage | null>,
  onUploaded: (upload: Upload) => void
) => {
  const items = ref<QueueItem[]>([]);
  const controllers = new Map<number, AbortController>();
  let nextId = 1;

  const find = (id: number) => items.value.find((item) => item.id === id)!;

  /** Bytes queued or in flight but not counted in `usage` yet. */
  const pendingBytes = () =>
    items.value
      .filter((item) => item.status === "queued" || item.status === "uploading")
      .reduce((sum, item) => sum + item.file.size, 0);

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
      const error = validateFile(file, usage.value, pendingBytes());
      items.value.push({
        id: nextId++,
        file,
        visibility,
        status: error ? "rejected" : "queued",
        progress: 0,
        error,
        result: null
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
    const error = validateFile(item.file, usage.value, pendingBytes());
    item.error = error;
    item.status = error ? "rejected" : "queued";
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

  return { items, hasFinished, add, cancel, retry, dismiss, clearFinished };
};
