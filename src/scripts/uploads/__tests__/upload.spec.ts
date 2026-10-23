import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptFor,
  categoryOf,
  sendUpload,
  typeLabel,
  UploadError,
  validateFile,
  validateFileName
} from "@/scripts/uploads/upload";
import { aFile, anUpload, someUsage } from "@/__tests__/helpers/uploads";
import { mockXhr } from "@/__tests__/helpers/xhr";

const MB = 1024 * 1024;

describe("categoryOf", () => {
  it.each([
    ["image/png", "image"],
    ["video/mp4", "video"],
    ["audio/mpeg", "audio"],
    ["application/zip", "archive"],
    ["application/x-7z-compressed", "archive"],
    ["application/x-tar", "archive"],
    ["application/gzip", "archive"],
    ["application/pdf", "document"],
    ["text/plain", "document"],
    ["", "document"]
  ])("puts %s under %s", (mimeType, category) => {
    expect(categoryOf(mimeType)).toBe(category);
  });
});

describe("typeLabel", () => {
  it("shows the extension without the dot, in capitals", () => {
    expect(typeLabel(".tar")).toBe("TAR");
    expect(typeLabel("")).toBe("");
  });
});

describe("acceptFor", () => {
  it("lists each extension and MIME type once", () => {
    expect(acceptFor(someUsage().allowedTypes)).toBe(
      ".png,image/png,.jpg,image/jpeg,.txt,text/plain"
    );
  });
});

describe("validateFile", () => {
  it("rejects an empty file even before usage is known", () => {
    expect(validateFile(aFile("a.png", 0), null)).toBe("This file is empty.");
  });

  it("lets anything else through while usage is unknown; the API checks again", () => {
    expect(validateFile(aFile("a.exe", 10, "application/x-msdownload"), null)).toBe("");
  });

  it.each([
    ["by MIME type", aFile("no-extension", 10, "image/png")],
    ["by extension", aFile("notes.TXT", 10, "")],
    [".jpeg as .jpg", aFile("photo.jpeg", 10, "")]
  ])("accepts an allowed type %s", (_how, file) => {
    expect(validateFile(file, someUsage())).toBe("");
  });

  it("rejects a type that isn't allowed", () => {
    expect(validateFile(aFile("page.html", 10, "text/html"), someUsage())).toBe(
      "This file type isn't supported."
    );
    expect(validateFile(aFile(".hidden", 10, ""), someUsage())).toBe(
      "This file type isn't supported."
    );
  });

  it("rejects a file over the size limit", () => {
    expect(validateFile(aFile("big.png", 10 * MB + 1), someUsage())).toBe(
      "The file is larger than the 10 MB limit."
    );
  });

  it("counts what's already queued against the quota", () => {
    const usage = someUsage({ usedBytes: 90 * MB });
    expect(validateFile(aFile("a.png", 5 * MB), usage)).toBe("");
    expect(validateFile(aFile("a.png", 5 * MB), usage, 6 * MB)).toBe(
      "This upload would go over your storage quota."
    );
  });
});

describe("validateFileName", () => {
  it.each(["photo.png", "  spaced  ", "x".repeat(255)])("accepts %s", (name) => {
    expect(validateFileName(name)).toBe("");
  });

  it.each(["", "   ", "x".repeat(256), "a/b", "a\\b", "tab\there", "del\u007f"])(
    "rejects %j",
    (name) => {
      expect(validateFileName(name)).toMatch(/^File names must be 1–255 characters/);
    }
  );
});

describe("sendUpload", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("posts the visibility, then the file, with credentials, and reports progress", async () => {
    const requests = mockXhr();
    const onProgress = vi.fn();
    const file = aFile("a.png");
    const sent = sendUpload(file, "public", onProgress);
    const [request] = requests;

    expect(request.method).toBe("POST");
    expect(request.url).toBe("https://api.test/upload");
    expect(request.withCredentials).toBe(true);
    expect([...request.body!.keys()]).toEqual(["visibility", "file"]);
    expect(request.body!.get("visibility")).toBe("public");
    expect(request.body!.get("file")).toBeInstanceOf(File);

    request.progress(25, 100);
    request.progress(1, 0, false);
    expect(onProgress.mock.calls).toEqual([[0.25]]);

    request.respond(201, { message: "File uploaded successfully.", upload: anUpload("u1") });
    await expect(sent).resolves.toEqual(anUpload("u1"));
    expect(onProgress).toHaveBeenLastCalledWith(1);
  });

  it("rejects with the API's error message", async () => {
    const requests = mockXhr();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn());
    requests[0].respond(415, { error: "This file type isn't supported." });

    await expect(sent).rejects.toEqual(new UploadError("This file type isn't supported."));
  });

  it("falls back to the status when the error isn't JSON or has no message", async () => {
    const requests = mockXhr();
    const first = sendUpload(aFile("a.png"), "private", vi.fn());
    requests[0].respond(502, "<html>Bad gateway</html>", "Bad Gateway");
    await expect(first).rejects.toThrow("Upload failed: Bad Gateway");

    const second = sendUpload(aFile("a.png"), "private", vi.fn());
    requests[1].respond(500, {});
    await expect(second).rejects.toThrow("Upload failed: 500");
  });

  it("rejects when the connection fails", async () => {
    const requests = mockXhr();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn());
    requests[0].fail();

    await expect(sent).rejects.toThrow("Error connecting to server");
  });

  it("aborts through the signal and marks the error as cancelled", async () => {
    mockXhr();
    const controller = new AbortController();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn(), controller.signal);
    controller.abort();

    await expect(sent).rejects.toMatchObject({ message: "Cancelled", cancelled: true });
  });
});
