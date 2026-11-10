import { afterEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h, ref, type Ref } from "vue";
import { mount } from "@vue/test-utils";
import { useRemWidth } from "@/composables/useRemWidth";

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
        measuring.width = useRemWidth(target);
        return () => (measured ? h("div", { ref: target }) : null);
      }
    })
  );
  return { wrapper, width: measuring.width! };
};

describe("useRemWidth", () => {
  afterEach(() => {
    document.documentElement.style.fontSize = "";
    observe.mockClear();
    disconnect.mockClear();
  });

  it("follows the element's width in rem from its first measurement, and stops watching on unmount", () => {
    stubResizeObserver();
    const { wrapper, width } = mountMeasured();

    expect(width.value).toBeNull();
    expect(observe).toHaveBeenCalledWith(wrapper.element);

    // jsdom has no font size of its own, so the browser's default 16px stands in.
    report(200);
    expect(width.value).toBe(12.5);
    document.documentElement.style.fontSize = "20px";
    report(250);
    expect(width.value).toBe(12.5);

    wrapper.unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it("watches nothing while there's no element", () => {
    stubResizeObserver();
    const { wrapper, width } = mountMeasured(false);

    expect(observe).not.toHaveBeenCalled();
    expect(width.value).toBeNull();
    wrapper.unmount();
    expect(disconnect).not.toHaveBeenCalled();
  });
});
