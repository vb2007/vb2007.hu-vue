import { nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { AUTO_LANGUAGE, useNewPaste } from "@/composables/useNewPaste";

const created = {
  _id: "p1",
  content: "hello world",
  addedBy: "u1",
  addedOn: "2026-10-10T12:00:00.000Z"
};

describe("useNewPaste", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("rejects a paste that is too short without calling the API", async () => {
    const newPaste = useNewPaste();
    newPaste.content.value = " a ";

    await newPaste.create();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(newPaste.errorMessage.value).toBe("A paste needs at least 2 characters.");
  });

  it("stores the created paste and clears the input on success", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { message: "Paste created successfully.", paste: created })
    );
    const newPaste = useNewPaste();
    newPaste.content.value = "hello world";

    const pending = newPaste.create();
    expect(newPaste.isLoading.value).toBe(true);
    await pending;

    expect(fetchMock).toHaveBeenCalledWith("https://api.test/paste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paste: "hello world", language: "plaintext" }),
      credentials: "include"
    });
    expect(newPaste.createdPaste.value).toEqual(created);
    expect(newPaste.content.value).toBe("");
    expect(newPaste.isLoading.value).toBe(false);
  });

  it("shows the API's error when it refuses", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "You are not logged in." }));
    const newPaste = useNewPaste();
    newPaste.content.value = "hello world";

    await newPaste.create();

    expect(newPaste.errorMessage.value).toBe("You are not logged in.");
    expect(newPaste.createdPaste.value).toBeNull();
    expect(newPaste.content.value).toBe("hello world");
    expect(newPaste.isLoading.value).toBe(false);
  });

  it("reports an unreachable server", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const newPaste = useNewPaste();
    newPaste.content.value = "hello world";

    await newPaste.create();

    expect(newPaste.errorMessage.value).toBe("Error connecting to server");
    expect(newPaste.isLoading.value).toBe(false);
  });

  it("reset clears the result and the error", () => {
    const newPaste = useNewPaste();
    newPaste.createdPaste.value = created;
    newPaste.errorMessage.value = "oops";

    newPaste.reset();

    expect(newPaste.createdPaste.value).toBeNull();
    expect(newPaste.errorMessage.value).toBe("");
  });

  describe("language", () => {
    const python =
      "import os\n\ndef main():\n    print(os.getcwd())\n\nif __name__ == '__main__':\n    main()";

    it("detects the language once typing pauses", async () => {
      vi.useFakeTimers();
      const newPaste = useNewPaste();
      expect(newPaste.language.value).toBe(AUTO_LANGUAGE);

      newPaste.content.value = "def";
      await nextTick();
      newPaste.content.value = python;
      await nextTick();
      vi.advanceTimersByTime(249);
      expect(newPaste.detected.value).toBe("plaintext");

      vi.advanceTimersByTime(1);
      expect(newPaste.detected.value).toBe("python");
      expect(newPaste.resolvedLanguage.value).toBe("python");
    });

    it("follows the user's pick over the detection", () => {
      const newPaste = useNewPaste();
      newPaste.detected.value = "python";
      newPaste.language.value = "ruby";

      expect(newPaste.resolvedLanguage.value).toBe("ruby");
    });

    it("detects right away when sent before the detection caught up, then goes back to auto", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { paste: created }));
      const newPaste = useNewPaste();
      newPaste.content.value = python;

      await newPaste.create();

      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string)).toEqual({
        paste: python,
        language: "python"
      });
      expect(newPaste.language.value).toBe(AUTO_LANGUAGE);
    });

    it("sends the picked language and resets it after creating", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(201, { paste: created }));
      const newPaste = useNewPaste();
      newPaste.content.value = python;
      newPaste.language.value = "markdown";

      await newPaste.create();

      expect(JSON.parse(fetchMock.mock.calls[0][1]!.body as string).language).toBe("markdown");
      expect(newPaste.language.value).toBe(AUTO_LANGUAGE);
    });
  });
});
