import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useOauthError } from "@/composables/useOauthError";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const Probe = defineComponent({
  setup() {
    const message = useOauthError();
    return () => h("p", message.value);
  }
});

describe("useOauthError", () => {
  it("explains the error and drops only it from the URL", async () => {
    const { wrapper, router } = await mountWithRouter(
      Probe,
      {},
      "/login?oauthError=accessDenied&keep=1#top"
    );
    await flushPromises();

    expect(wrapper.text()).toBe("GitHub login was cancelled, so nothing changed.");
    expect(router.currentRoute.value.fullPath).toBe("/login?keep=1#top");
  });

  it("stays empty and leaves the URL alone without an error", async () => {
    const { wrapper, router } = await mountWithRouter(Probe, {}, "/login?oauthError=");
    await flushPromises();

    expect(wrapper.text()).toBe("");
    expect(router.currentRoute.value.fullPath).toBe("/login?oauthError=");
  });
});
