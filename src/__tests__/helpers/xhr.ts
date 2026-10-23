import { vi } from "vitest";

/**
 * A stand-in for XMLHttpRequest that records what was sent and lets a test drive it:
 * `progress(loaded, total)`, `respond(status, body)`, `fail()`. Aborting fires `onabort` like the real one.
 */
export class FakeXhr {
  static instances: FakeXhr[] = [];

  method = "";
  url = "";
  withCredentials = false;
  body: FormData | null = null;
  status = 0;
  statusText = "";
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: FormData) {
    this.body = body;
  }

  abort() {
    this.onabort?.();
  }

  progress(loaded: number, total: number, lengthComputable = true) {
    this.upload.onprogress?.({ loaded, total, lengthComputable } as ProgressEvent);
  }

  respond(status: number, body: unknown, statusText = "") {
    this.status = status;
    this.statusText = statusText;
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.onload?.();
  }

  fail() {
    this.onerror?.();
  }
}

/** Replaces the global XMLHttpRequest with `FakeXhr`; the requests made land in `FakeXhr.instances`. */
export const mockXhr = () => {
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  return FakeXhr.instances;
};
