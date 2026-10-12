import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import ShortLinkResolver from "@/components/features/redirect/ShortLinkResolver.vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";
import { formatDateTime } from "@/scripts/utility/dateUtil";

describe("ShortLinkResolver", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const navigate = vi.fn<(url: string) => void>();

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const mountResolver = (code = "abc123", preview = false) =>
    mountWithRouter(ShortLinkResolver, { props: { code, preview, navigate } });

  const ADDED_ON = "2026-08-04T15:45:29.680Z";
  const shared = (extra: object = {}) =>
    jsonResponse(200, {
      originalUrl: "https://github.com/vb2007",
      addedBy: { username: "test" },
      addedOn: ADDED_ON,
      ...extra
    });

  it("looks the link up, then shows where it's going", async () => {
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountResolver();

    expect(wrapper.find("h1").text()).toBe("Short link");
    expect(wrapper.find(".note").text()).toBe("Looking up this link…");

    respond(jsonResponse(200, { originalUrl: "https://example.com/long" }));
    await flushPromises();

    expect(wrapper.find(".note").text()).toBe("Taking you there…");
    expect(wrapper.find(".target").attributes("href")).toBe("https://example.com/long");
    expect(navigate).toHaveBeenCalledWith("https://example.com/long");
  });

  it("explains an unknown link and offers the shortener", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "The shortened URL cannot be found." })
    );
    const { wrapper } = await mountResolver("nope");
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toBe("The shortened URL cannot be found.");
    expect(wrapper.find('a[href="/shorten"]').text()).toBe("Shorten a link");
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("won't open an unsafe target", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { originalUrl: "javascript:alert(1)" }));
    const { wrapper } = await mountResolver();
    await flushPromises();

    expect(wrapper.find('[role="alert"]').text()).toContain("won't open");
    expect(wrapper.find(".target").exists()).toBe(false);
  });

  it("can try again after a connection error", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://example.com" }));
    const { wrapper } = await mountResolver();
    await flushPromises();
    expect(wrapper.find('[role="alert"]').text()).toBe("Error connecting to server");

    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith("https://example.com");
  });

  it("resolves again when the code changes", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://one.example" }))
      .mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://two.example" }));
    const { wrapper } = await mountResolver("one");
    await flushPromises();

    await wrapper.setProps({ code: "two" });
    await flushPromises();

    expect(navigate).toHaveBeenLastCalledWith("https://two.example");
  });

  it("says who shared the link while it takes you there", async () => {
    fetchMock.mockResolvedValueOnce(shared());
    const { wrapper } = await mountResolver();
    await flushPromises();

    expect(wrapper.find(".byline").text()).toBe(`Shared by test on ${formatDateTime(ADDED_ON)}`);
  });

  it("leaves out whatever the API didn't say", async () => {
    fetchMock
      .mockResolvedValueOnce(shared({ addedBy: null }))
      .mockResolvedValueOnce(shared({ addedOn: undefined }))
      .mockResolvedValueOnce(shared({ addedBy: null, addedOn: undefined }));
    const { wrapper } = await mountResolver("one");
    await flushPromises();
    expect(wrapper.find(".byline").text()).toBe(`Shared on ${formatDateTime(ADDED_ON)}`);

    await wrapper.setProps({ code: "two" });
    await flushPromises();
    expect(wrapper.find(".byline").text()).toBe("Shared by test");

    await wrapper.setProps({ code: "three" });
    await flushPromises();
    expect(wrapper.find(".byline").exists()).toBe(false);
  });

  it("names who shared an unsafe link", async () => {
    fetchMock.mockResolvedValueOnce(shared({ originalUrl: "javascript:alert(1)" }));
    const { wrapper } = await mountResolver();
    await flushPromises();

    expect(wrapper.find(".byline").text()).toContain("Shared by test");
  });

  it("previews where a link leads without going there", async () => {
    fetchMock.mockResolvedValueOnce(shared());
    const { wrapper } = await mountResolver("abc123", true);
    await flushPromises();

    const facts = wrapper.findAll(".fact");
    expect(facts.map((fact) => fact.find("dt").text())).toEqual([
      "Leads to",
      "Shared by",
      "Shared on"
    ]);
    expect(wrapper.find(".host").text()).toBe("github.com");
    expect(wrapper.find(".target").text()).toBe("https://github.com/vb2007");
    expect(facts[1].find("dd").text()).toBe("test");
    expect(wrapper.find("time").attributes("datetime")).toBe(ADDED_ON);
    expect(wrapper.find("time").text()).toBe(formatDateTime(ADDED_ON));

    const go = wrapper.find('a[href="https://github.com/vb2007"]');
    expect(go.text()).toBe("Continue to github.com");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("previews just the destination when the API doesn't say who shared it", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { originalUrl: "https://github.com" }));
    const { wrapper } = await mountResolver("abc123", true);
    await flushPromises();

    expect(wrapper.findAll(".fact")).toHaveLength(1);
  });

  it("stays in preview when trying again", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(shared());
    const { wrapper } = await mountResolver("abc123", true);
    await flushPromises();

    await wrapper.find("button").trigger("click");
    await flushPromises();

    expect(wrapper.find(".host").text()).toBe("github.com");
    expect(navigate).not.toHaveBeenCalled();
  });
});
