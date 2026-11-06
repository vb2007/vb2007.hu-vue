import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { PARALLEL_UPLOADS, useUploadQueue } from "@/composables/useUploadQueue";
import type { UploadUsage } from "@/types/api/uploads";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountComposable } from "@/__tests__/helpers/host";
import { aFile, anUpload, someUsage } from "@/__tests__/helpers/uploads";
import { mockXhr, type FakeXhr } from "@/__tests__/helpers/xhr";

const MB = 1024 * 1024;

describe("useUploadQueue", () => {
  let requests: FakeXhr[];
  let onUploaded: ReturnType<typeof vi.fn>;
  const usage = ref<UploadUsage | null>(null);

  const mountQueue = () => mountComposable(() => useUploadQueue(usage, onUploaded));

  beforeEach(() => {
    requests = mockXhr();
    onUploaded = vi.fn();
    usage.value = someUsage();
  });

  it(`uploads ${PARALLEL_UPLOADS} at a time and starts the next when one lands`, async () => {
    const { api } = mountQueue();
    api.add([aFile("a.png"), aFile("b.png"), aFile("c.png")], "public");

    expect(api.items.value.map((item) => item.status)).toEqual([
      "uploading",
      "uploading",
      "queued"
    ]);
    expect(requests).toHaveLength(2);
    expect(requests[0].body!.get("visibility")).toBe("public");

    requests[0].progress(50, 100);
    expect(api.items.value[0].progress).toBe(0.5);

    requests[0].respond(201, { upload: anUpload("a") });
    await flushPromises();

    expect(api.items.value[0]).toMatchObject({
      status: "done",
      progress: 1,
      result: anUpload("a")
    });
    expect(onUploaded).toHaveBeenCalledWith(anUpload("a"));
    expect(api.items.value[2].status).toBe("uploading");
    expect(requests).toHaveLength(3);
    expect(api.hasFinished.value).toBe(true);
  });

  it("rejects files the pre-check turns down without sending them", () => {
    const { api } = mountQueue();
    api.add([aFile("page.html", 10, "text/html")], "private");

    expect(api.items.value[0]).toMatchObject({
      status: "rejected",
      error: "This file type isn't supported."
    });
    expect(requests).toHaveLength(0);
  });

  it("counts queued files against the quota", () => {
    usage.value = someUsage({ usedBytes: 90 * MB, maxFileSizeBytes: 100 * MB });
    const { api } = mountQueue();
    api.add([aFile("a.png", 6 * MB), aFile("b.png", 6 * MB)], "private");

    expect(api.items.value.map((item) => item.status)).toEqual(["uploading", "rejected"]);
  });

  it("keeps the API's error on a failed upload, and retries it", async () => {
    const { api } = mountQueue();
    api.add([aFile("a.png")], "private");
    requests[0].respond(413, { error: "This upload would go over your storage quota." });
    await flushPromises();

    expect(api.items.value[0]).toMatchObject({
      status: "failed",
      error: "This upload would go over your storage quota."
    });
    expect(onUploaded).not.toHaveBeenCalled();

    api.retry(api.items.value[0].id);
    expect(api.items.value[0]).toMatchObject({ status: "uploading", error: "" });
    expect(requests).toHaveLength(2);
  });

  it("rejects a retry the pre-check now says no to, e.g. once the quota filled up", async () => {
    const { api } = mountQueue();
    api.add([aFile("a.png", 2 * MB)], "private");
    requests[0].fail();
    await flushPromises();
    expect(api.items.value[0]).toMatchObject({
      status: "failed",
      error: "Error connecting to server"
    });

    usage.value = someUsage({ usedBytes: 99 * MB });
    api.retry(api.items.value[0].id);

    expect(api.items.value[0]).toMatchObject({
      status: "rejected",
      error: "This upload would go over your storage quota."
    });
  });

  it("takes a file off the list", () => {
    const { api } = mountQueue();
    api.add([aFile("page.html", 10, "text/html"), aFile("a.png")], "private");
    api.dismiss(api.items.value[0].id);

    expect(api.items.value.map((item) => item.file.name)).toEqual(["a.png"]);
  });

  it("cancels an upload in flight and one still waiting", async () => {
    const { api } = mountQueue();
    api.add([aFile("a.png"), aFile("b.png"), aFile("c.png")], "private");
    const [a, b, c] = api.items.value;

    api.cancel(c.id);
    expect(api.items.value[2].status).toBe("cancelled");

    api.cancel(a.id);
    await flushPromises();
    expect(api.items.value[0]).toMatchObject({ status: "cancelled", error: "" });

    // Cancelling one that already finished does nothing.
    requests[1].respond(201, { upload: anUpload("b") });
    await flushPromises();
    api.cancel(b.id);
    expect(api.items.value[1].status).toBe("done");
  });

  it("clears finished files and keeps the ones still going", async () => {
    const { api } = mountQueue();
    api.add([aFile("a.png"), aFile("b.png"), aFile("c.png")], "private");
    requests[0].respond(201, { upload: anUpload("a") });
    await flushPromises();

    api.clearFinished();
    expect(api.items.value.map((item) => item.file.name)).toEqual(["b.png", "c.png"]);
    expect(api.hasFinished.value).toBe(false);
  });

  it("aborts uploads still running when it goes away", async () => {
    const { api, wrapper } = mountQueue();
    api.add([aFile("a.png")], "private");
    wrapper.unmount();
    await flushPromises();

    expect(api.items.value[0].status).toBe("cancelled");
  });

  describe("signed links of finished private files", () => {
    let fetchMock: ReturnType<typeof mockFetch>;
    const NOW = Date.UTC(2026, 10, 6, 12);
    const signedFor = (id: string, minutes: number) =>
      anUpload(id, {
        url: `https://cdn.test/${id}.png?expires=${NOW / 1000 + minutes * 60}&sig=x`
      });

    /** Two private files and a public one, uploaded and done. */
    const finish = async () => {
      const mounted = mountQueue();
      mounted.api.add([aFile("a.png"), aFile("b.png")], "private");
      requests[0].respond(201, { upload: signedFor("a", 60) });
      requests[1].respond(201, { upload: signedFor("b", 60) });
      await flushPromises();
      mounted.api.add([aFile("c.png")], "public");
      requests[2].respond(201, { upload: anUpload("c", { visibility: "public" }) });
      await flushPromises();
      return mounted;
    };

    beforeEach(() => {
      fetchMock = mockFetch();
      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.useFakeTimers({ now: NOW });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("are renewed just before they expire", async () => {
      const { api } = await finish();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(200, { upload: signedFor("a", 120) }))
        .mockResolvedValueOnce(jsonResponse(200, { upload: signedFor("b", 120) }));

      vi.advanceTimersByTime(59 * 60_000);
      await flushPromises();

      expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([
        "https://api.test/upload/a",
        "https://api.test/upload/b"
      ]);
      expect(api.items.value.map((item) => item.result!.url)).toEqual([
        signedFor("a", 120).url,
        signedFor("b", 120).url,
        anUpload("c").url
      ]);
    });

    it("say why one couldn't be renewed, and stop asking for it", async () => {
      const { api } = await finish();
      fetchMock
        .mockResolvedValueOnce(jsonResponse(404, { error: "There is no such upload." }))
        .mockResolvedValueOnce(jsonResponse(200, { upload: signedFor("b", 120) }))
        .mockResolvedValueOnce(jsonResponse(200, { upload: signedFor("b", 180) }));

      vi.advanceTimersByTime(59 * 60_000);
      await flushPromises();
      expect(api.items.value[0].linkError).toBe("There is no such upload.");
      expect(api.items.value[1].linkError).toBe("");

      vi.advanceTimersByTime(60 * 60_000);
      await flushPromises();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(String(fetchMock.mock.calls[2][0])).toBe("https://api.test/upload/b");
    });

    it("are left alone once the queue goes away mid-renewal", async () => {
      const { api, wrapper } = await finish();
      deferResponse(fetchMock);
      deferResponse(fetchMock);

      vi.advanceTimersByTime(59 * 60_000);
      wrapper.unmount();
      await flushPromises();

      expect(api.items.value[0].result).toEqual(signedFor("a", 60));
      expect(api.items.value[0].linkError).toBe("");
    });
  });
});
