import type { Page } from "@playwright/test";

/** Sets the browser's default font size, which also scales `rem` media queries, unlike a style. */
export const browserFontSize = async (page: Page, px: number) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: px } });
};
