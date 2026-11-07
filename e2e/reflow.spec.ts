import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

// WCAG 1.4.10 Reflow: at 320 CSS px (1280 px at 400% zoom), and with a large browser font size,
// nothing scrolls sideways and nothing is cut off: columns shrink to the window, and keys and long
// values wrap (#272).

/** How far the page scrolls sideways. */
const sideways = (page: Page) =>
  page.locator("html").evaluate((html) => html.scrollWidth - html.clientWidth);

/**
 * What in the page's content an ancestor that hides its overflow cuts off (a board, a link), and
 * every board or section whose gutters differ, i.e. that runs into the page's right gutter.
 */
const cutOff = (page: Page) =>
  page.locator("main").evaluate((main) => {
    // The e2e tsconfig has no DOM lib, so the element type comes from `main`.
    type El = typeof main;
    const view = main.ownerDocument.defaultView!;
    const width = main.ownerDocument.documentElement.clientWidth;
    const name = (el: El) => `<${el.tagName.toLowerCase()}> ${el.textContent?.trim().slice(0, 40)}`;
    const found: string[] = [];

    for (const section of main.querySelectorAll<El>("section")) {
      const box = section.getBoundingClientRect();
      if (Math.abs(box.left - (width - box.right)) > 1) found.push(`gutters of ${name(section)}`);
    }

    // A board's content stays inside its padding: a key there would run into the board's edge.
    for (const body of main.querySelectorAll<El>("section > header + div")) {
      const frame = body.getBoundingClientRect();
      const style = view.getComputedStyle(body);
      const right = frame.right - parseFloat(style.paddingRight) + 0.5;
      for (const el of body.querySelectorAll<El>("*"))
        if (el.getBoundingClientRect().right > right) found.push(`padding: ${name(el)}`);
    }

    for (const el of main.querySelectorAll<El>("*")) {
      const box = el.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      for (let up = el.parentElement; up && up !== main.parentElement; up = up.parentElement) {
        const style = view.getComputedStyle(up);
        // An ellipsis is the design's way to shorten a line, and a scroller shows the rest.
        if (!["hidden", "clip"].includes(style.overflowX) || style.textOverflow === "ellipsis")
          continue;
        const frame = up.getBoundingClientRect();
        if (frame.width <= 1) break; // visually hidden
        if (box.right > frame.right + 0.5 || box.left < frame.left - 0.5) {
          found.push(name(el));
          break;
        }
      }
    }
    return found;
  });

/** Sets the browser's default font size, which also scales `rem` media queries, unlike a style. */
const browserFontSize = async (page: Page, px: number) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Page.enable");
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: px } });
};

const expectReflow = async (page: Page) => {
  await expect.poll(() => sideways(page)).toBe(0);
  await expect.poll(() => cutOff(page)).toEqual([]);
};

for (const path of ["/", "/pastebin", "/shorten", "/upload", "/login", "/register"]) {
  test(`${path} logged out fits a 320 px window`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(path);
    await expect(
      page
        .locator("main")
        .getByRole("link", { name: /Log in|Register/ })
        .first()
    ).toBeVisible();

    await expectReflow(page);
  });
}

for (const [width, target, host] of [
  [375, "https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap", "developer.mozilla.org"],
  [
    320,
    "https://downloads.documentation-mirror.example.co.uk/files/a.zip",
    "downloads.documentation-mirror.example.co.uk"
  ]
] as const) {
  test(`a short link's preview shows all of ${host} at ${width} px`, async ({ page, api }) => {
    api.hasShortLink("abc123", target);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/r/abc123/preview");
    await expect(page.getByRole("link", { name: `Continue to ${host}` })).toBeVisible();
    await expect(page.getByText(target, { exact: true })).toBeVisible();

    await expectReflow(page);
  });
}

test("an upload's details show its whole link at 320 px", async ({ page, api }) => {
  api.loggedInAs();
  api.hasUpload("holiday-photo-from-the-beach.png");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto("/upload");
  await page.getByRole("button", { name: /holiday-photo-from-the-beach\.png/ }).click();
  await expect(page.getByText("Link", { exact: true })).toBeVisible();

  await expectReflow(page);
});

test("with a 32 px browser font size, the gate, a preview and an upload's link fit", async ({
  page,
  api
}) => {
  api.hasShortLink("abc123", "https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-wrap");
  await browserFontSize(page, 32);
  await page.setViewportSize({ width: 640, height: 900 });

  for (const path of ["/", "/r/abc123/preview"]) {
    await page.goto(path);
    await expect(page.locator("main").getByRole("link").first()).toBeVisible();
    await expectReflow(page);
  }

  api.loggedInAs();
  api.hasUpload("holiday-photo-from-the-beach.png");
  await page.goto("/upload");
  await page.getByRole("button", { name: /holiday-photo-from-the-beach\.png/ }).click();
  await expect(page.getByText("Link", { exact: true })).toBeVisible();
  await expectReflow(page);
});

test("the GitHub key's icon stays beside its label, wrapped or not", async ({ page }) => {
  await page.goto("/login");
  const key = page.getByRole("link", { name: "Log in with GitHub" });
  // From the icon's right edge to the first line's text, and how many lines the label takes.
  const layout = () =>
    key.evaluate((el) => {
      const icon = el.querySelector("svg")!.getBoundingClientRect();
      // The label's text, from its first letter.
      const text = [...el.querySelector("span")!.childNodes].find((node) =>
        node.textContent?.trim()
      )!;
      const range = el.ownerDocument.createRange();
      range.setStart(text, text.textContent!.search(/\S/));
      range.setEnd(text, text.textContent!.length);
      const rects = [...range.getClientRects()].filter((rect) => rect.width > 1);
      return {
        gap: Math.round(rects[0].left - icon.right),
        lines: new Set(rects.map((rect) => Math.round(rect.top))).size
      };
    });

  // One line from 330 px; at 320 the icon leads the first line, rather than waiting at the edge.
  await page.setViewportSize({ width: 330, height: 800 });
  await expect.poll(layout).toEqual({ gap: 8, lines: 1 });
  await page.setViewportSize({ width: 320, height: 800 });
  await expect.poll(layout).toEqual({ gap: 8, lines: 2 });
});
