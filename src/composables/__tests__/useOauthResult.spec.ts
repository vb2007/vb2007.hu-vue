import { describe, expect, it } from "vitest";
import { defineComponent, h } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useOauthResult } from "@/composables/useOauthResult";
import { mountWithRouter } from "@/__tests__/helpers/mount";

const Probe = defineComponent({
  setup() {
    const { error, linked } = useOauthResult();
    return () => h("p", `${error.value}|${linked.value}`);
  }
});

describe("useOauthResult", () => {
  it("explains the error and drops only it from the URL", async () => {
    const { wrapper, router } = await mountWithRouter(
      Probe,
      {},
      "/login?oauthError=accessDenied&keep=1#top"
    );
    await flushPromises();

    expect(wrapper.text()).toBe("GitHub login was cancelled, so nothing changed.|false");
    expect(router.currentRoute.value.fullPath).toBe("/login?keep=1#top");
  });

  it("notices a finished link and drops it from the URL", async () => {
    const { wrapper, router } = await mountWithRouter(Probe, {}, "/account?github=linked");
    await flushPromises();

    expect(wrapper.text()).toBe("|true");
    expect(router.currentRoute.value.fullPath).toBe("/account");
  });

  it("stays empty and leaves the URL alone without a result", async () => {
    const { wrapper, router } = await mountWithRouter(Probe, {}, "/login?oauthError=&github=other");
    await flushPromises();

    expect(wrapper.text()).toBe("|false");
    expect(router.currentRoute.value.fullPath).toBe("/login?oauthError=&github=other");
  });
});
