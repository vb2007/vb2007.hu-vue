import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import PasteViewer from "@/components/features/pastebin/PasteViewer.vue";
import AppIcon from "@/components/ui/AppIcon.vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const paste = (id: string, content = "line one\n  line two") => ({
  _id: id,
  content,
  addedBy: "u1",
  addedOn: "2026-10-10T12:00:00.000Z"
});

const mountViewer = async (id = "p1", as?: "h1") => {
  const { wrapper } = await mountWithRouter(PasteViewer, { props: { id, as } });
  return wrapper;
};

describe("PasteViewer", () => {
  it("shows a loading note, then the paste with its date", async () => {
    const fetchMock = mockFetch();
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const wrapper = await mountViewer("p1", "h1");

    expect(wrapper.find("h1").text()).toBe("Paste");
    expect(wrapper.find(".note").text()).toBe("Loading paste…");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.test/paste/p1");

    respond(jsonResponse(200, { paste: paste("p1") }));
    await flushPromises();

    expect(wrapper.find("pre").text()).toBe("line one\n  line two");
    expect(wrapper.find("time").attributes("datetime")).toBe("2026-10-10T12:00:00.000Z");
    expect(wrapper.find(".note").text()).toMatch(/^Added /);
    expect(wrapper.find('a[href="/pastebin"]').text()).toBe("New paste");
  });

  it("copies the text and the link", async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse(200, { paste: paste("p1") }));
    const wrapper = await mountViewer();
    await flushPromises();
    const [copyText, copyLink] = wrapper.findAll("button");
    expect(copyText.text()).toBe("Copy text");
    expect(copyLink.text()).toBe("Copy link");

    await copyText.trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("line one\n  line two");
    expect(copyText.text()).toBe("Copied");
    expect(copyText.findComponent(AppIcon).props("name")).toBe("check");
    expect(wrapper.find('[role="status"]').text()).toBe("Copied to clipboard");

    await copyLink.trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
      `${window.location.origin}/pastebin/p1`
    );
    expect(copyLink.text()).toBe("Copied");
  });

  it("says so when copying fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(jsonResponse(200, { paste: paste("p1") }));
    vi.mocked(navigator.clipboard.writeText)
      .mockRejectedValueOnce(new Error("denied"))
      .mockRejectedValueOnce(new Error("denied"));
    const wrapper = await mountViewer();
    await flushPromises();
    const [copyText, copyLink] = wrapper.findAll("button");

    await copyText.trigger("click");
    await copyLink.trigger("click");
    await flushPromises();

    expect(copyText.text()).toBe("Copy failed");
    expect(copyLink.text()).toBe("Copy failed");
    expect(wrapper.find('[role="status"]').text()).toBe("");
  });

  it("shows the error and a way back when the paste can't be loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch().mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such paste with that ID." })
    );
    const wrapper = await mountViewer("p404");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("There is no such paste with that ID.");
    expect(wrapper.find('a[href="/pastebin"]').text()).toBe("Go to Pastebin");
    expect(wrapper.find("pre").exists()).toBe(false);
  });

  it("loads the new paste when the ID changes", async () => {
    const fetchMock = mockFetch();
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { paste: paste("p1") }))
      .mockResolvedValueOnce(jsonResponse(200, { paste: paste("p2", "second") }));
    const wrapper = await mountViewer();
    await flushPromises();

    await wrapper.setProps({ id: "p2" });
    await flushPromises();

    expect(fetchMock.mock.calls[1][0]).toBe("https://api.test/paste/p2");
    expect(wrapper.find("pre").text()).toBe("second");
  });
});
