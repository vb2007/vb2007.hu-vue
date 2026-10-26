import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useQueryNotice } from "@/composables/useQueryNotice";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const Probe = defineComponent({
  setup() {
    const value = useQueryNotice("github");
    return () => h("p", value);
  }
});

describe("useQueryNotice", () => {
  it("reads the value and drops only it from the URL", async () => {
    const { wrapper, router } = await mountWithRouter(
      Probe,
      {},
      "/account?github=linked&keep=1#top"
    );
    await flushPromises();

    expect(wrapper.text()).toBe("linked");
    expect(router.currentRoute.value.fullPath).toBe("/account?keep=1#top");
  });

  it.each(["/account?github=", "/account?github=a&github=b"])(
    "stays empty and leaves %s alone",
    async (path) => {
      const { wrapper, router } = await mountWithRouter(Probe, {}, path);
      await flushPromises();

      expect(wrapper.text()).toBe("");
      expect(router.currentRoute.value.fullPath).toBe(path);
    }
  );
});
