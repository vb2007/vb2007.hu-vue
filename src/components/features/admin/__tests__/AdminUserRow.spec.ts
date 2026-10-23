import { describe, expect, it, vi } from "vitest";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import AdminUserRow from "@/components/features/admin/AdminUserRow.vue";
import { QUOTA_UNITS, type AdminUser } from "@/scripts/admin/adminUser";
import { anAdminUser } from "@/__tests__/helpers/admin";
import { createTestRouter } from "@/__tests__/helpers/mount";

const { GB } = QUOTA_UNITS;

const mountRow = (user: AdminUser, props: { saving?: boolean; error?: string } = {}) => {
  const setQuota = vi.fn<(id: string, quotaBytes: number | null) => Promise<boolean>>();
  const wrapper = mount(AdminUserRow, {
    props: { user, saving: false, error: "", setQuota, ...props },
    global: { plugins: [createTestRouter()] }
  });
  return { wrapper, setQuota };
};

const buttonNamed = (wrapper: VueWrapper, name: string) =>
  wrapper.findAll("button").find((button) => button.text().includes(name))!;

const open = (wrapper: VueWrapper) => wrapper.find(".row__name").trigger("click");

describe("AdminUserRow", () => {
  it("sums up the user: name, files, join date and used of quota", () => {
    const { wrapper } = mountRow(anAdminUser("a", { uploads: { count: 1 } }));

    expect(wrapper.find(".row__name").text()).toBe("user-a");
    expect(wrapper.find(".row__meta").text()).toMatch(/^1 file · joined /);
    expect(wrapper.find(".row__meta time").attributes("datetime")).toBe("2026-01-10T12:00:00.000Z");
    expect(wrapper.find(".measure__figure").text()).toBe("2 GB of 10 GB");
    const meter = wrapper.find("[role=meter]");
    expect(meter.attributes()).toMatchObject({
      "aria-label": "Storage used by user-a",
      "aria-valuenow": String(2 * GB),
      "aria-valuemax": String(10 * GB),
      "aria-valuetext": "2 GB of 10 GB"
    });
    expect(meter.attributes("style")).toContain("--share: 0.2");
    expect(meter.classes()).toContain("measure__line--some");
    expect(wrapper.find(".measure--full").exists()).toBe(false);
    expect(wrapper.find(".tag").exists()).toBe(false);
    expect(wrapper.find(".details").exists()).toBe(false);
  });

  it("tags the admin and a custom quota", () => {
    const { wrapper } = mountRow(
      anAdminUser("a", { isSuperuser: true, uploads: { count: 3, hasCustomQuota: true } })
    );

    expect(wrapper.find(".row__meta").text()).toMatch(/^3 files/);
    expect(wrapper.findAll(".tag").map((tag) => tag.text())).toEqual(["Admin", "Custom quota"]);
  });

  it("marks a user over their quota, and a quota of 0, as full", () => {
    const over = mountRow(
      anAdminUser("a", { uploads: { usedBytes: 12 * GB, quotaBytes: 10 * GB } })
    ).wrapper;
    expect(over.find(".measure--full").exists()).toBe(true);
    expect(over.find("[role=meter]").attributes("aria-valuenow")).toBe(String(10 * GB));
    expect(over.find("[role=meter]").attributes("style")).toContain("--share: 1");

    const zero = mountRow(anAdminUser("b", { uploads: { usedBytes: 0, quotaBytes: 0 } })).wrapper;
    expect(zero.find(".measure--full").exists()).toBe(true);
    expect(zero.find("[role=meter]").classes()).not.toContain("measure__line--some");
    expect(zero.find("[role=meter]").attributes("style")).toContain("--share: 1");
  });

  it("opens its own details with the facts and the current quota in the editor", async () => {
    const { wrapper } = mountRow(anAdminUser("a"));
    await open(wrapper);

    expect(wrapper.find(".row__name").attributes("aria-expanded")).toBe("true");
    expect(wrapper.find(".details").attributes("id")).toBe(
      wrapper.find(".row__name").attributes("aria-controls")
    );
    const facts = wrapper.findAll(".facts__row").map((row) => row.text());
    expect(facts).toEqual([
      "E-maila@example.com",
      `Used2 GB (${(2 * GB).toLocaleString()} bytes)`,
      "Quota10 GB (the default)"
    ]);
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("10");
    expect(wrapper.find("input").attributes("inputmode")).toBe("decimal");
    expect((wrapper.find("select").element as HTMLSelectElement).value).toBe("GB");
    expect(buttonNamed(wrapper, "Use default").attributes("disabled")).toBeDefined();
    expect(wrapper.find('a[href="/admin/users/a/uploads"]').text()).toBe("Browse uploads");

    await open(wrapper);
    expect(wrapper.find(".details").exists()).toBe(false);
  });

  it("shows how far over the quota a user is", async () => {
    const { wrapper } = mountRow(
      anAdminUser("a", { uploads: { usedBytes: 12 * GB, hasCustomQuota: true } })
    );
    await open(wrapper);

    expect(wrapper.find(".facts__row--over").text()).toBe("Over by2 GB");
    expect(wrapper.findAll(".facts__row")[2].text()).toBe("Quota10 GB (custom)");
  });

  it("saves a new quota in the chosen unit", async () => {
    const user = anAdminUser("a");
    const { wrapper, setQuota } = mountRow(user);
    setQuota.mockImplementation(async (_id, quotaBytes) => {
      await wrapper.setProps({
        user: {
          ...user,
          uploads: { ...user.uploads, quotaBytes: quotaBytes!, hasCustomQuota: true }
        }
      });
      return true;
    });
    await open(wrapper);

    await wrapper.find("input").setValue("2.5");
    await wrapper.find("select").setValue("TB");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(setQuota).toHaveBeenCalledWith("a", 2.5 * QUOTA_UNITS.TB);
    expect(wrapper.find(".status").text()).toBe("Quota set to 2.5 TB.");
    // The editor follows the saved quota.
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("2.5");

    // Typing again clears the confirmation.
    await wrapper.find("input").setValue("3");
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("warns before a quota below what the user has, and refuses one that isn't a size", async () => {
    const { wrapper, setQuota } = mountRow(anAdminUser("a"));
    await open(wrapper);

    await wrapper.find("input").setValue("1");
    expect(wrapper.find(".field__hint").text()).toMatch(/^That's less than user-a uses now/);
    expect(wrapper.find("input").attributes("aria-describedby")).toContain(
      wrapper.find(".field__hint").attributes("id")
    );

    await wrapper.find("input").setValue("a lot");
    expect(wrapper.find(".field__hint").exists()).toBe(false);
    await wrapper.find("form").trigger("submit");

    expect(setQuota).not.toHaveBeenCalled();
    expect(wrapper.find(".field__error").text()).toBe("Enter a size of 0 or more.");
  });

  it("doesn't save a quota that didn't change, so the default stays the default", async () => {
    const { wrapper, setQuota } = mountRow(anAdminUser("a"));
    await open(wrapper);
    expect(buttonNamed(wrapper, "Save quota").attributes("disabled")).toBeDefined();

    await wrapper.find("input").setValue("10.0");
    await wrapper.find("form").trigger("submit");

    expect(setQuota).not.toHaveBeenCalled();
  });

  it("keeps the editor open with no confirmation when saving fails", async () => {
    const { wrapper, setQuota } = mountRow(anAdminUser("a"));
    setQuota.mockResolvedValue(false);
    await open(wrapper);

    await wrapper.find("input").setValue("12");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(setQuota).toHaveBeenCalledWith("a", 12 * GB);
    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("puts a custom quota back on the default", async () => {
    const user = anAdminUser("a", { uploads: { quotaBytes: 25 * GB, hasCustomQuota: true } });
    const { wrapper, setQuota } = mountRow(user);
    setQuota.mockImplementation(async () => {
      await wrapper.setProps({
        user: { ...user, uploads: { ...user.uploads, quotaBytes: 10 * GB, hasCustomQuota: false } }
      });
      return true;
    });
    await open(wrapper);

    await buttonNamed(wrapper, "Use default").trigger("click");
    await flushPromises();

    expect(setQuota).toHaveBeenCalledWith("a", null);
    expect(wrapper.find(".status").text()).toBe("Back on the default quota, 10 GB.");
  });

  it("doesn't confirm a reset that failed", async () => {
    const { wrapper, setQuota } = mountRow(anAdminUser("a", { uploads: { hasCustomQuota: true } }));
    setQuota.mockResolvedValue(false);
    await open(wrapper);

    await buttonNamed(wrapper, "Use default").trigger("click");
    await flushPromises();

    expect(wrapper.find(".status").exists()).toBe(false);
  });

  it("shows saving and the row's error", async () => {
    const { wrapper } = mountRow(anAdminUser("a", { uploads: { hasCustomQuota: true } }), {
      saving: true,
      error: "Invalid quota."
    });
    await open(wrapper);

    expect(wrapper.find(".status").text()).toBe("Invalid quota.");
    expect(buttonNamed(wrapper, "Saving").attributes("aria-busy")).toBe("true");
    expect(buttonNamed(wrapper, "Use default").attributes("disabled")).toBeDefined();
  });
});
