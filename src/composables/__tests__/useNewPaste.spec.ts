import { beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { useNewPaste } from "@/composables/useNewPaste";

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
      body: JSON.stringify({ paste: "hello world" }),
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
});
