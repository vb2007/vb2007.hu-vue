import type { DOMWrapper } from "@vue/test-utils";

/**
 * What `element`'s `aria-describedby` reads out: the text of each element it names, in order,
 * whitespace collapsed ("" without one). jsdom doesn't compute accessible descriptions, so this
 * stands in for it, mounted in the document or not.
 */
export const descriptionOf = (element: DOMWrapper<Element>) => {
  const root = element.element.getRootNode() as ParentNode;
  return (element.attributes("aria-describedby") ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => root.querySelector(`[id="${id}"]`)?.textContent ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
};
