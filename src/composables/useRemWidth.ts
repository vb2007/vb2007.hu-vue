import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** The browser's default before anyone changes it, for a root whose font size can't be read. */
const DEFAULT_ROOT_FONT_PX = 16;

const rootFontPx = (): number =>
  parseFloat(getComputedStyle(document.documentElement).fontSize) || DEFAULT_ROOT_FONT_PX;

/**
 * `target`'s content width in rem, so it compares with sizes the CSS gives in rem whatever the
 * reader's font size, kept up to date while it's mounted, or `null` before it's measured.
 */
export function useRemWidth(target: Readonly<Ref<HTMLElement | null>>) {
  const width = ref<number | null>(null);
  let observer: ResizeObserver | null = null;

  onMounted(() => {
    if (!target.value) return;
    observer = new ResizeObserver(([entry]) => {
      width.value = entry.contentRect.width / rootFontPx();
    });
    observer.observe(target.value);
  });
  onBeforeUnmount(() => observer?.disconnect());

  return width;
}
