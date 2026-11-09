import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

/** `target`'s content width in px, kept up to date while it's mounted, or `null` before it's measured. */
export function useElementWidth(target: Readonly<Ref<HTMLElement | null>>) {
  const width = ref<number | null>(null);
  const observer = new ResizeObserver(([entry]) => {
    width.value = entry.contentRect.width;
  });

  onMounted(() => {
    if (target.value) observer.observe(target.value);
  });
  onBeforeUnmount(() => observer.disconnect());

  return width;
}
