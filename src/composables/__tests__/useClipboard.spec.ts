import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { useClipboard } from "@/composables/useClipboard";

// onBeforeUnmount needs a component instance, so the composable runs inside a tiny host.
const mountClipboard = (resetAfterMs?: number) => {
  let api!: ReturnType<typeof useClipboard>;
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useClipboard(resetAfterMs);
        return () => null;
      }
    })
  );
  return { wrapper, api };
};

describe("useClipboard", () => {
  it("copies the text and flags success until the reset delay passes", async () => {
    vi.useFakeTimers();
    const { api } = mountClipboard();

    await api.copy("https://api.test/r/abc");

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://api.test/r/abc");
    expect(api.copied.value).toBe(true);
    expect(api.failed.value).toBe(false);

    vi.advanceTimersByTime(1800);
    expect(api.copied.value).toBe(false);
  });

  it("flags a failure when the clipboard refuses", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(navigator.clipboard.writeText).mockRejectedValueOnce(new Error("denied"));
    const { api } = mountClipboard(500);

    await api.copy("text");

    expect(api.copied.value).toBe(false);
    expect(api.failed.value).toBe(true);

    vi.advanceTimersByTime(500);
    expect(api.failed.value).toBe(false);
  });

  it("restarts the reset delay on every copy", async () => {
    vi.useFakeTimers();
    const { api } = mountClipboard(1000);

    await api.copy("one");
    vi.advanceTimersByTime(800);
    await api.copy("two");
    vi.advanceTimersByTime(800);

    expect(api.copied.value).toBe(true);
  });

  it("cancels the pending reset when the component unmounts", async () => {
    vi.useFakeTimers();
    const { wrapper, api } = mountClipboard();
    await api.copy("text");

    wrapper.unmount();
    vi.advanceTimersByTime(1800);

    expect(api.copied.value).toBe(true);
  });
});
