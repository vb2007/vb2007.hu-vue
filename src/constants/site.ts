/** The site's name: the navbar's and footer's brand, and the end of every tab and history title. */
export const SITE_NAME = "vb2007.hu";

/** Between a page's own title and the site's name in the tab ("Paste · vb2007.hu"). */
export const TITLE_SEPARATOR = " · ";

/** A page's tab title: its own title then the site's name, or just the name for a page without one. */
export function pageTitle(title?: string): string {
  return title ? `${title}${TITLE_SEPARATOR}${SITE_NAME}` : SITE_NAME;
}
