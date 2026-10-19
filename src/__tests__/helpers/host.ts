import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";

/** Runs a composable inside a tiny component, for the ones that use lifecycle hooks. */
export const mountComposable = <T>(use: () => T) => {
  let api!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = use();
        return () => null;
      }
    })
  );
  return { wrapper, api };
};
