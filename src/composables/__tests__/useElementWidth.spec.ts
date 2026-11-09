import { describe, expect, it, vi } from "vitest";
import { defineComponent, h, nextTick, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { useElementWidth } from "@/composables/useElementWidth";

const observe = vi.fn();
const disconnect = vi.fn();
let report: (width: number) => void = () => {};

const stubResizeObserver = () =>
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        report = (width) => callback([{ contentRect: { width } }]);
      }
      observe = observe;
      disconnect = disconnect;
    }
  );

/** Mounts a component measuring its own element, or nothing when `measured` is false. */
const mountMeasured = (measured = true) => {
  const measuring: { width?: Ref<number | null> } = {};
  const wrapper = mount(
    defineComponent({
      setup() {
        const target = ref<HTMLElement | null>(null);
        measuring.width = useElementWidth(target);
        return () => (measured ? h("div", { ref: target }) : null);
      }
    })
  );
  return { wrapper, width: measuring.width! };
};

describe("useElementWidth", () => {
  it("follows the element's width from its first measurement, and stops watching on unmount", async () => {
    stubResizeObserver();
    const { wrapper, width } = mountMeasured();

    expect(width.value).toBeNull();
    expect(observe).toHaveBeenCalledWith(wrapper.element);

    report(278);
    await nextTick();
    expect(width.value).toBe(278);
    report(373);
    expect(width.value).toBe(373);

    wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("watches nothing while there's no element", () => {
    stubResizeObserver();
    observe.mockClear();
    const { width } = mountMeasured(false);

    expect(observe).not.toHaveBeenCalled();
    expect(width.value).toBeNull();
  });
});
