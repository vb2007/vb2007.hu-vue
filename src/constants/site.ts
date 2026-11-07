/** The site's name, as the browser tab and history show it. */
export const SITE_NAME = "vb2007.hu";

/** Between a page's own title and the site's name in the tab ("Paste · vb2007.hu"). */
export const TITLE_SEPARATOR = " · ";

/**
 * The robots meta that keeps a page out of search results. The not-found pages are answered with
 * `200` (the SPA fallback), so without it a crawler could index them as real pages (a soft 404).
 */
export const NOINDEX_META = { name: "robots", content: "noindex" } as const;

/** A page's tab title: its own title then the site's name, or just the name for a page without one. */
export function pageTitle(title?: string): string {
  return title ? `${title}${TITLE_SEPARATOR}${SITE_NAME}` : SITE_NAME;
}
