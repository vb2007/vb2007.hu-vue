import { expect, test } from "./fixtures";

test("home page renders the hero, the shortener gate and the tools directory", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Welcome home" })).toBeVisible();
  await expect(page.getByText("only logged-in users can shorten links")).toBeVisible();
  const tools = page.getByRole("region", { name: "Tools" });
  await expect(tools.getByRole("heading", { name: "Tools" })).toBeVisible();
  await expect(
    tools.getByText("Opening a shared link, paste or file needs no account; making one does.")
  ).toBeVisible();

  // Each row carries its own description and is itself the way in.
  await tools.getByRole("link", { name: /^Paste Share text and code snippets/ }).click();
  await expect(page).toHaveURL("/pastebin");
});

test("a board header keeps its padding above the kerb hatch", async ({ page }) => {
  await page.goto("/login");
  const head = page.locator("header", {
    has: page.getByRole("heading", { level: 1, name: "Log in" })
  });

  // The bottom padding is the top padding plus the hatch's height, so the title stays centred above it.
  const { top, bottom, hatch } = await head.evaluate((el) => {
    // The e2e tsconfig has no DOM lib, so reach the page's window through the element.
    const view = el.ownerDocument.defaultView!;
    const style = view.getComputedStyle(el);
    return {
      top: parseFloat(style.paddingTop),
      bottom: parseFloat(style.paddingBottom),
      hatch: parseFloat(view.getComputedStyle(el, "::after").height)
    };
  });
  expect(hatch).toBeGreaterThan(0);
  expect(bottom).toBeCloseTo(top + hatch, 1);
});

test("footer links lead to each page", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("navigation", { name: "Footer" });

  await footer.getByRole("link", { name: "Log in" }).click();
  await expect(page).toHaveURL("/login");
  await expect(page.getByRole("heading", { level: 1, name: "Log in" })).toBeVisible();

  await footer.getByRole("link", { name: "Register" }).click();
  await expect(page).toHaveURL("/register");
  await expect(page.getByRole("heading", { level: 1, name: "Register" })).toBeVisible();

  await footer.getByRole("link", { name: "Shorten" }).click();
  await expect(page).toHaveURL("/shorten");
  await expect(page.getByRole("heading", { level: 1, name: "Shorten" })).toBeVisible();

  await footer.getByRole("link", { name: "Paste" }).click();
  await expect(page).toHaveURL("/pastebin");
  await expect(page.getByRole("heading", { level: 1, name: "Paste" })).toBeVisible();

  await footer.getByRole("link", { name: "Upload" }).click();
  await expect(page).toHaveURL("/upload");
  await expect(page.getByRole("heading", { level: 1, name: "Upload" })).toBeVisible();

  // The contact links leave the site, so they're checked rather than followed.
  const contact = page.getByRole("contentinfo").locator("address");
  await expect(
    contact.getByRole("link", { name: "E-mail: balazs@vb2007.hu", exact: true })
  ).toHaveAttribute("href", "mailto:balazs@vb2007.hu");
  const matrix = contact.getByRole("link", {
    name: "Matrix: @vb2007:vb2007.hu (opens in a new tab)",
    exact: true
  });
  await expect(matrix).toHaveAttribute("href", "https://matrix.to/#/@vb2007:vb2007.hu");
  await expect(matrix).toHaveAttribute("target", "_blank");
  await expect(matrix).toHaveAttribute("rel", "noopener");
});

test("the mobile menu opens and closes", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the menu toggle only exists on narrow screens");
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open menu" });

  await toggle.click();
  await expect(page.getByRole("button", { name: "Close menu" })).toHaveAttribute(
    "aria-expanded",
    "true"
  );

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});
