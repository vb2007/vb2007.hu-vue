import { NOINDEX_META } from "@/constants/site";

/** Marks the tag added here, so a robots tag the page already had is never touched. */
const OWN_TAG = "data-route-noindex";

/**
 * Adds `<meta name="robots" content="noindex">` to the head, or removes it again. Calling it twice
 * never adds a second tag, and only the tag added here is ever removed.
 */
export function setNoindex(noindex: boolean): void {
  const tag = document.head.querySelector(`meta[${OWN_TAG}]`);
  if (noindex && !tag) {
    const meta = document.createElement("meta");
    meta.name = NOINDEX_META.name;
    meta.content = NOINDEX_META.content;
    meta.setAttribute(OWN_TAG, "");
    document.head.append(meta);
  } else if (!noindex) {
    tag?.remove();
  }
}
