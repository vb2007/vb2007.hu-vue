import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptFor,
  categoryOf,
  copiedLinkNote,
  linkExpiresAt,
  sendUpload,
  typeLabel,
  UploadError,
  validateFile,
  validateFileName
} from "@/scripts/uploads/upload";
import { Endpoints } from "@/constants/endpoints";
import { onSessionRefused } from "@/scripts/api/client";
import { aFile, anUpload, someUsage } from "@/__tests__/helpers/uploads";
import { formatTime } from "@/scripts/utility/dateUtil";
import { mockXhr } from "@/__tests__/helpers/xhr";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { isLoggedIn, sessionEnded } from "@/scripts/authentication/authState";

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

describe("linkExpiresAt", () => {
  it("reads when a signed link stops working, in ms", () => {
    expect(
      linkExpiresAt("https://cdn.test/useruploads/u1/a.png?expires=1790000000&sig=Ab-_9")
    ).toBe(1_790_000_000_000);
    expect(linkExpiresAt("https://cdn.test/a.png?sig=x&expires=5#top")).toBe(5000);
  });

  it("has nothing for a plain link or an unreadable expiry", () => {
    expect(linkExpiresAt("https://cdn.test/useruploads/u1/a.png")).toBeUndefined();
    expect(linkExpiresAt("https://cdn.test/a.png?expires=soon")).toBeUndefined();
    expect(linkExpiresAt("https://cdn.test/a.png?expires=")).toBeUndefined();
  });
});

describe("copiedLinkNote", () => {
  it("says when a copied signed link expires, and nothing for a plain one", () => {
    expect(copiedLinkNote("https://cdn.test/a.png?expires=1793995200&sig=x")).toBe(
      `The copied link expires at ${formatTime(1_793_995_200_000)}.`
    );
    expect(copiedLinkNote("https://cdn.test/a.png")).toBe("");
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

  it("tells the client about an ended session before it rejects, like apiRequest", async () => {
    let finish!: () => void;
    const listener = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    onSessionRefused(listener);
    const requests = mockXhr();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn());
    let settled = false;
    sent.catch(() => (settled = true));
    requests[0].respond(403, { error: "You must be logged in to perform this action." });

    expect(listener).toHaveBeenCalledWith(Endpoints.Uploads.upload);
    await Promise.resolve();
    expect(settled).toBe(false);
    finish();
    await expect(sent).rejects.toThrow("You must be logged in to perform this action.");
  });

  it("still rejects with the API's error when the session check fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    onSessionRefused(() => Promise.reject(new Error("listener broke")));
    const requests = mockXhr();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn());
    requests[0].respond(403, { error: "You must be logged in to perform this action." });

    await expect(sent).rejects.toThrow("You must be logged in to perform this action.");
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

  it("fails a success that comes without a JSON body, like apiRequest", async () => {
    const requests = mockXhr();
    const onProgress = vi.fn();
    const sent = sendUpload(aFile("a.png"), "private", onProgress);
    requests[0].respond(201, "", "Created");

    await expect(sent).rejects.toThrow("Upload failed: Created");
    expect(onProgress).not.toHaveBeenCalled();
  });

  describe("when the connection drops", () => {
    // The API may answer an upload early and close the connection (vb2007/vb2007.hu-api#451, #455),
    // which a browser still sending can report as a network error, so the session is checked.
    const user = { _id: "0123456789abcdef01234567", email: "me@example.com", username: "me" };

    /** An upload whose connection then fails, with the page logged in. */
    const dropped = () => {
      isLoggedIn.value = true;
      const requests = mockXhr();
      const sent = sendUpload(aFile("a.png"), "private", vi.fn());
      requests[0].fail();
      return sent;
    };

    it("rejects with the session message and logs the page out when the session has ended", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValueOnce(
        jsonResponse(403, { error: "You must be logged in to perform this action." })
      );

      await expect(dropped()).rejects.toEqual(
        new UploadError("You must be logged in to perform this action.")
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith("https://api.test/user", {
        method: "GET",
        credentials: "include"
      });
      expect(isLoggedIn.value).toBe(false);
      expect(sessionEnded.value).toBe(true);
    });

    it("rejects with the connection error when the session is still there", async () => {
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValueOnce(jsonResponse(200, user));

      await expect(dropped()).rejects.toEqual(new UploadError("Error connecting to server"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isLoggedIn.value).toBe(true);
      expect(sessionEnded.value).toBe(false);
    });

    it("rejects with the connection error when the session check can't be made either", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = mockFetch();
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(dropped()).rejects.toEqual(new UploadError("Error connecting to server"));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(isLoggedIn.value).toBe(true);
    });

    it("keeps the connection error when the check fails without saying the session ended", async () => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const fetchMock = mockFetch();
      fetchMock.mockResolvedValueOnce(jsonResponse(502, undefined, "Bad Gateway"));

      await expect(dropped()).rejects.toEqual(new UploadError("Error connecting to server"));
      expect(isLoggedIn.value).toBe(true);
    });
  });

  it("aborts through the signal and marks the error as cancelled", async () => {
    mockXhr();
    const controller = new AbortController();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn(), controller.signal);
    controller.abort();

    await expect(sent).rejects.toMatchObject({ message: "Cancelled", cancelled: true });
  });

  it("doesn't check the session after an abort, only after a dropped connection", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    mockXhr();
    const controller = new AbortController();
    const sent = sendUpload(aFile("a.png"), "private", vi.fn(), controller.signal);
    controller.abort();

    await expect(sent).rejects.toMatchObject({ cancelled: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(isLoggedIn.value).toBe(true);
  });
});
