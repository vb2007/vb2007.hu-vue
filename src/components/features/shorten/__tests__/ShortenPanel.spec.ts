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
    expect(wrapper.emitted("created")).toHaveLength(1);
    expect(wrapper.findComponent(TicketSlip).props()).toMatchObject({
      value: `${window.location.origin}/r/abc123`,
      display: `${window.location.host}/r/abc123`
    });

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

  it("tells nobody a link was created when the API refuses it", async () => {
    isLoggedIn.value = true;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = mockFetch();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: "The URI/URL you've provided isn't valid." })
    );
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("https://example.com/a");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".field__error").text()).toBe("The URI/URL you've provided isn't valid.");
    expect(wrapper.emitted("created")).toBeUndefined();
    vi.restoreAllMocks();
  });

  it("checks the URL once it's left", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel);
    const input = wrapper.find("input");
    expect(wrapper.find('button[type="submit"]').attributes("aria-disabled")).toBe("true");

    await input.setValue("fos.hu");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    await input.trigger("blur");
    expect(wrapper.find(".field__error").text()).toBe("Invalid URL / URI format.");

    await input.setValue("https://fos.hu");
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(wrapper.find('button[type="submit"]').attributes("aria-disabled")).toBeUndefined();
  });

  it("says a URL is too long while it's still in the field, and doesn't send it", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    const { wrapper } = await mountWithRouter(ShortenPanel);
    const input = wrapper.find("input");
    const url = (length: number) =>
      `https://example.com/${"a".repeat(length - "https://example.com/".length)}`;

    await input.setValue(url(2001));
    expect(input.element.value).toHaveLength(2001);
    expect(wrapper.find(".field__error").text()).toBe(
      `This URL is ${(2001).toLocaleString()} characters; the limit is ${(2000).toLocaleString()}.`
    );
    expect(wrapper.find('button[type="submit"]').attributes("aria-disabled")).toBe("true");

    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();

    await input.setValue(url(2000));
    expect(wrapper.find(".field__error").exists()).toBe(false);
    expect(wrapper.find('button[type="submit"]').attributes("aria-disabled")).toBeUndefined();
  });

  it("refuses a URL with a space without sending it", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("https://example.com/a b");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find(".field__error").text()).toBe(
      "A URL can't contain spaces. Remove them, or write each one as %20."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names a space while the URL is still in the field", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("https://example.com/a b");

    expect(wrapper.find(".field__error").text()).toBe(
      "A URL can't contain spaces. Remove them, or write each one as %20."
    );
    expect(wrapper.find('button[type="submit"]').attributes("aria-disabled")).toBe("true");
  });

  it("names a space before the length in a long pasted URL, like the API", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue(`https://example.com/a b${"c".repeat(2000)}`);

    expect(wrapper.find(".field__error").text()).toBe(
      "A URL can't contain spaces. Remove them, or write each one as %20."
    );
  });

  it("names the format first for a long URL without a scheme", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(ShortenPanel);

    await wrapper.find("input").setValue("a".repeat(2001));

    expect(wrapper.find(".field__error").text()).toBe("Invalid URL / URI format.");
  });
});
