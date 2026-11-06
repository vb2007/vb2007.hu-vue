import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enableAutoUnmount, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import AdminUserSuspension from "@/components/features/admin/AdminUserSuspension.vue";
import { Messages } from "@/constants/messages";
import type { AdminUser } from "@/types/api/admin";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { deferResponse, jsonResponse, mockFetch } from "@/__tests__/helpers/fetch";

enableAutoUnmount(afterEach);

const SUSPENDED_AT = "2026-11-06T10:00:00.000Z";

describe("AdminUserSuspension", () => {
  let fetchMock: ReturnType<typeof mockFetch>;

  beforeEach(() => {
    fetchMock = mockFetch();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  /** Takes the emitted account back in, like the page's `applyUser`. */
  const mountRow = (user: AdminUser) => {
    const wrapper: VueWrapper = mount(AdminUserSuspension, {
      props: {
        user,
        onUpdated: (updated: AdminUser) => wrapper.setProps({ user: updated })
      },
      attachTo: document.body
    });
    return wrapper;
  };

  const keys = (wrapper: VueWrapper) => wrapper.findAll("button").map((key) => key.text());

  it("explains what suspending does, behind a Suspend key", () => {
    const wrapper = mountRow(anAdminUser("a"));

    expect(wrapper.find("h3").text()).toBe("Suspend account");
    expect(wrapper.find(".action__note").text().replace(/\s+/g, " ")).toBe(
      "Ends user-a's session and stops them logging in until you lift it. Their pastes, short links and uploads stay up."
    );
    expect(keys(wrapper)).toEqual(["Suspend"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("has no key on the admin's own account, and says why", () => {
    const wrapper = mountRow(anAdminUser("a", { isSuperuser: true }));

    expect(wrapper.find(".action__note").text()).toBe(Messages.Admin.superuserNotSuspendable);
    expect(wrapper.find("button").exists()).toBe(false);
  });

  it("asks before suspending, and Cancel or Escape backs out without a request", async () => {
    const wrapper = mountRow(anAdminUser("a"));

    await wrapper.find("button").trigger("click");
    expect(wrapper.find(".confirm__text").text().replace(/\s+/g, " ")).toBe(
      "Suspend user-a? They're logged out at once, and can't log in again until you lift the suspension."
    );
    expect(keys(wrapper)).toEqual(["Suspend user-a", "Cancel"]);
    expect(document.activeElement?.textContent?.trim()).toBe("Suspend user-a");

    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();
    expect(wrapper.find(".confirm").exists()).toBe(false);
    expect(document.activeElement?.textContent?.trim()).toBe("Suspend");

    await wrapper.find("button").trigger("click");
    // No refusal to describe yet.
    expect(wrapper.find("button[type=submit]").attributes("aria-describedby")).toBeUndefined();
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    await flushPromises();
    expect(wrapper.find(".confirm").exists()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("suspends once confirmed, then offers to lift it", async () => {
    const wrapper = mountRow(anAdminUser("a"));
    const response = deferResponse(fetchMock);

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("submit");
    expect(keys(wrapper)).toEqual(["Suspending", "Cancel"]);
    // Busy, the confirmation stays: Escape and Cancel wait for the answer.
    await wrapper.find("form").trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".confirm").exists()).toBe(true);

    response.respond(
      jsonResponse(200, {
        message: "User suspended successfully: their session was ended.",
        user: anAdminUser("a", { suspendedAt: SUSPENDED_AT })
      })
    );
    await flushPromises();

    expect(wrapper.emitted("updated")).toEqual([[anAdminUser("a", { suspendedAt: SUSPENDED_AT })]]);
    expect(wrapper.find(".confirm").exists()).toBe(false);
    expect(wrapper.find("h3").text()).toBe("Suspension");
    expect(wrapper.find(".action__note").text().replace(/\s+/g, " ")).toBe(
      "user-a can't log in while suspended. Lifting it lets them log in again, with their password or GitHub."
    );
    expect(wrapper.find(".status--success").text()).toBe(
      "User suspended successfully: their session was ended."
    );
    // The pressed key went with the confirmation, so focus moves to the one in its place.
    expect(document.activeElement?.textContent?.trim()).toBe("Lift suspension");
  });

  it("keeps the confirmation open with the refusal in it", async () => {
    const wrapper = mountRow(anAdminUser("a"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, { error: "There is no such user with that ID." })
    );

    await wrapper.find("button").trigger("click");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const refusal = wrapper.find(".confirm .status--error");
    expect(refusal.text()).toBe("There is no such user with that ID.");
    expect(wrapper.emitted("updated")).toBeUndefined();
    // Back on the key that was pressed, which is tied to the refusal, so Escape still cancels.
    const confirmKey = wrapper.find("button[type=submit]");
    expect(document.activeElement).toBe(confirmKey.element);
    expect(confirmKey.attributes("aria-describedby")).toBe(refusal.attributes("id"));

    // Cancel takes the refusal along.
    await wrapper.findAll("button")[1].trigger("click");
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("lifts a suspension at once, and shows a failure under the key", async () => {
    const wrapper = mountRow(anAdminUser("a", { suspendedAt: SUSPENDED_AT }));
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: "Database down." }));

    await wrapper.find("button").trigger("click");
    await flushPromises();
    expect(wrapper.find(".outcome.status--error").text()).toBe("Database down.");
    expect(keys(wrapper)).toEqual(["Lift suspension"]);
    expect(document.activeElement).toBe(wrapper.find("button").element);

    const response = deferResponse(fetchMock);
    await wrapper.find("button").trigger("click");
    expect(keys(wrapper)).toEqual(["Lifting"]);
    response.respond(
      jsonResponse(200, { message: "User unsuspended successfully.", user: anAdminUser("a") })
    );
    await flushPromises();

    expect(String(fetchMock.mock.calls[1][1]?.body)).toBe(JSON.stringify({ suspended: false }));
    expect(wrapper.find("h3").text()).toBe("Suspend account");
    expect(wrapper.find(".status--success").text()).toBe("User unsuspended successfully.");
    expect(wrapper.find(".status--error").exists()).toBe(false);
    expect(document.activeElement?.textContent?.trim()).toBe("Suspend");

    // Opening the confirmation clears the last word, so it can't be read as about the next change.
    await wrapper.find("button").trigger("click");
    expect(wrapper.find(".status").exists()).toBe(false);
  });
});
