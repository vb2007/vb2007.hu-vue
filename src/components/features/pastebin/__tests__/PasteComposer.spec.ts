import { describe, expect, it } from "vitest";
import { flushPromises } from "@vue/test-utils";
import PasteComposer from "@/components/features/pastebin/PasteComposer.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const created = {
  _id: "p1",
  content: "hello world",
  addedBy: "u1",
  addedOn: "2026-10-10T12:00:00.000Z"
};

describe("PasteComposer", () => {
  it("renders only the board while the session is still being checked", async () => {
    const { wrapper } = await mountWithRouter(PasteComposer);

    expect(wrapper.find("h2").text()).toBe("Paste");
    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.find(".gate").exists()).toBe(false);
  });

  it("asks logged-out visitors to register or log in", async () => {
    isSessionChecked.value = true;
    const { wrapper } = await mountWithRouter(PasteComposer, { props: { as: "h1" } });

    expect(wrapper.find("h1").text()).toBe("Paste");
    expect(wrapper.find(".gate").text()).toContain("Only logged-in users can create pastes");
    expect(wrapper.findAll(".gate a").map((link) => link.attributes("href"))).toEqual([
      "/register",
      "/login"
    ]);
  });

  it("creates a paste, shows its link and lets the user start over", async () => {
    isLoggedIn.value = true;
    const fetchMock = mockFetch();
    let respond!: (response: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise((resolve) => (respond = resolve)));
    const { wrapper } = await mountWithRouter(PasteComposer);

    expect(wrapper.find(".field__count").text()).toBe("0 / 10000");
    await wrapper.find("textarea").setValue("hello world");
    await wrapper.find("form").trigger("submit");
    expect(wrapper.find('button[type="submit"]').text()).toBe("Creating");

    respond(jsonResponse(201, { paste: created }));
    await flushPromises();

    expect(wrapper.find('button[type="submit"]').text()).toBe("Create paste");
    expect(wrapper.find("textarea").element.value).toBe("");
    const slip = wrapper.findComponent(TicketSlip);
    expect(slip.props()).toMatchObject({
      value: `${window.location.origin}/pastebin/p1`,
      caption: "Your paste link",
      againLabel: "Paste another"
    });
    expect(wrapper.emitted("created")).toEqual([[created]]);

    slip.vm.$emit("again");
    await flushPromises();

    expect(wrapper.findComponent(TicketSlip).exists()).toBe(false);
    expect(wrapper.emitted("created")).toHaveLength(1);
  });

  it("shows validation errors on the textarea", async () => {
    isLoggedIn.value = true;
    const { wrapper } = await mountWithRouter(PasteComposer);

    await wrapper.find("form").trigger("submit");

    expect(wrapper.find(".field__error").text()).toBe("A paste needs at least 2 characters.");
    expect(wrapper.emitted("created")).toBeUndefined();
  });
});
