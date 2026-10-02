import { expect, test } from "./fixtures";

test("home page renders the hero, the shortener gate and the route map", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Welcome home" })).toBeVisible();
  await expect(page.getByText("only logged-in users can shorten links")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Route map" })).toBeVisible();
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
