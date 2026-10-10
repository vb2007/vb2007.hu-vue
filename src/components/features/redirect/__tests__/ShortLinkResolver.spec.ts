import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import ShortLinkResolver from "@/components/features/redirect/ShortLinkResolver.vue";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

describe("ShortLinkResolver", () => {
  let fetchMock: ReturnType<typeof mockFetch>;
  const navigate = vi.fn<(url: string) => void>();

  beforeEach(() => {
    fetchMock = mockFetch();
    navigate.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const mountResolver = (code = "abc123") =>
    mountWithRouter(ShortLinkResolver, { props: { code, navigate } });

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
});
