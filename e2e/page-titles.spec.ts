import { expect, test } from "./fixtures";

test.describe("page titles", () => {
  for (const [path, title] of [
    ["/", "vb2007.hu"],
    ["/shorten", "Shorten · vb2007.hu"],
    ["/pastebin", "Paste · vb2007.hu"],
    ["/login", "Log in · vb2007.hu"],
    ["/admin/users", "Users · vb2007.hu"]
  ]) {
    test(`${path} has its own title`, async ({ page }) => {
      await page.goto(path);

      await expect(page).toHaveTitle(title);
    });
  }

  // The footer's links are router links, so this is the router's afterEach, not a page load.
  test("the title follows a navigation inside the app", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle("vb2007.hu");

    const footer = page.getByRole("navigation", { name: "Footer" });
    await footer.getByRole("link", { name: "Register" }).click();
    await expect(page).toHaveURL("/register");
    await expect(page).toHaveTitle("Register · vb2007.hu");
    expect(await page.title()).toBe("Register · vb2007.hu");

    await page.goBack();
    await expect(page).toHaveURL("/");
    await expect(page).toHaveTitle("vb2007.hu");
  });
});
