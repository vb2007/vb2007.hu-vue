/** The site's name: the navbar's and footer's brand, and the end of every tab and history title. */
export const SITE_NAME = "vb2007.hu";

/** The owner's e-mail address, shown in the footer's contact line. */
export const CONTACT_EMAIL = "balazs@vb2007.hu";

/** Writes to {@link CONTACT_EMAIL} in the visitor's mail app. */
export const CONTACT_MAILTO = `mailto:${CONTACT_EMAIL}`;

/** The owner's Matrix ID, shown in the footer's contact line. */
export const MATRIX_ID = "@vb2007:vb2007.hu";

/** Opens a chat with {@link MATRIX_ID} in whichever Matrix client the visitor picks. */
export const MATRIX_URL = `https://matrix.to/#/${MATRIX_ID}`;

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
