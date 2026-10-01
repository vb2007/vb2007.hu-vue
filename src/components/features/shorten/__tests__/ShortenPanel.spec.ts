import { describe, expect, it, vi } from "vitest";
import { flushPromises } from "@vue/test-utils";
import ShortenPanel from "@/components/features/shorten/ShortenPanel.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

describe("ShortenPanel", () => {
  it("renders only the board while the session is still being checked", async () => {
    const { wrapper } = await mountWithRouter(ShortenPanel);

    expect(wrapper.find("h2").text()).toBe("Shorten");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("asks logged-out visitors to register or log in", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel, { props: { as: "h1" } });

    expect(wrapper.find("h1").text()).toBe("Shorten");
    expect(wrapper.find(".gate").text()).toContain("only logged-in users can shorten links");
    expect(wrapper.findAll(".gate a").map((link) => link.attributes("href"))).toEqual([
      "/register",
      "/login"
    ]);
  });

  it("shortens a link and lets the user start over", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("https://example.com/a/long/path");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('button[type="submit"]').text()).toBe("Shortening");

    respond(jsonResponse(200, { data: { shortenedUrl: "abc123" } }));
    await flushPromises();

    expect(wrapper.find('button[type="submit"]').text()).toBe("Shorten");
    expect(wrapper.findComponent(TicketSlip).props("value")).toBe("https://api.test/r/abc123");

    wrapper.findComponent(TicketSlip).vm.$emit("again");
    await flushPromises();

    expect(wrapper.findComponent(TicketSlip).exists()).toBe(false);
  });

  it("shows validation errors on the input", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("not a url");
    await wrapper.find("form").trigger("submit");

    expect(wrapper.find(".field__error").text()).toBe("Invalid URL / URI format.");
    vi.restoreAllMocks();
  });
});
