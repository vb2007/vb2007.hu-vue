import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** A station board, found by its title. */
const board = (page: Page, title: string) =>
  page
    .locator("section.board")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });

test("logged out, the upload page asks to log in", async ({ page }) => {
  await page.goto("/upload");

  await expect(page.getByRole("heading", { level: 1, name: "Upload" })).toBeVisible();
  await expect(page.getByText("Only logged-in users can upload files.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your uploads" })).toHaveCount(0);
});

test("a user uploads files, copies the link and sees them listed", async ({
  page,
  api,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  api.loggedInAs();
  await page.goto("/upload");

  await expect(page.getByText("No uploads yet.")).toBeVisible();
  await expect(page.getByText("0 bytes of 10 GB used")).toBeVisible();

  await page
    .getByRole("group", { name: "New uploads are" })
    .getByLabel("Public")
    .check({ force: true });
  await page.getByLabel("Files to upload").setInputFiles([
    { name: "holiday.png", mimeType: "image/png", buffer: Buffer.alloc(4096) },
    { name: "page.html", mimeType: "text/html", buffer: Buffer.from("<p>hi</p>") }
  ]);

  const queue = page.getByRole("region", { name: "On the way" });
  await expect(queue.getByText("Uploaded · Public")).toBeVisible();
  await expect(queue.getByText("This file type isn't supported.")).toBeVisible();
  expect(api.uploads).toHaveLength(1);
  expect(api.uploads[0]).toMatchObject({ originalFileName: "holiday.png", visibility: "public" });

  await queue.getByRole("button", { name: "Copy link" }).click();
  await expect(queue.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate("navigator.clipboard.readText()")).toBe(api.uploads[0].url);

  await queue.getByRole("button", { name: "Remove" }).click();
  await expect(queue.getByText("page.html")).toHaveCount(0);

  const list = board(page, "Your uploads");
  await expect(list.getByText("1 upload", { exact: true })).toBeVisible();
  await expect(list.getByRole("button", { name: "holiday.png" })).toBeVisible();
  await expect(page.getByText("4 kB of 10 GB used")).toBeVisible();

  await queue.getByRole("button", { name: "Clear finished" }).click();
  await expect(queue).toHaveCount(0);
});

test("a user renames, re-scopes and deletes an upload", async ({ page, api }) => {
  api.loggedInAs();
  api.hasUpload("report.pdf", { fileSize: 50_000 });
  await page.goto("/upload");

  const list = board(page, "Your uploads");
  await list.getByRole("button", { name: "report.pdf" }).click();
  await expect(list.getByText("Only you, while you're logged in")).toBeVisible();

  await list.getByRole("button", { name: "Rename" }).click();
  await list.getByLabel("New name").fill("annual report.pdf");
  await list.getByLabel("New name").press("Enter");
  await expect(list.getByRole("button", { name: "annual report.pdf" })).toBeVisible();
  expect(api.uploads[0].originalFileName).toBe("annual report.pdf");

  await list.getByRole("button", { name: "Make public" }).click();
  await expect(list.getByText("Anyone with the link")).toBeVisible();
  expect(api.uploads[0].visibility).toBe("public");

  await list.getByRole("button", { name: "Delete", exact: true }).click();
  await list.getByRole("button", { name: "Confirm delete" }).click();
  await expect(list.getByText("No uploads yet.")).toBeVisible();
  expect(api.uploads).toEqual([]);
  await expect(page.getByText("0 bytes of 10 GB used")).toBeVisible();
});

test("the list searches, filters, sorts and pages through uploads", async ({ page, api }) => {
  api.loggedInAs();
  for (let i = 1; i <= 12; i++) {
    api.hasUpload(`photo-${String(i).padStart(2, "0")}.png`, {
      fileSize: i * 1000,
      visibility: i % 3 === 0 ? "public" : "private"
    });
  }
  await page.goto("/upload");

  const list = board(page, "Your uploads");
  const names = list.locator(".row__name");
  await expect(list.getByText("12 uploads")).toBeVisible();
  await expect(names.first()).toHaveText("photo-12.png");
  await expect(list.getByText("Page 1 of 2")).toBeVisible();

  await list.getByRole("button", { name: "Next" }).click();
  await expect(list.getByText("Page 2 of 2")).toBeVisible();
  await expect(names).toHaveText(["photo-02.png", "photo-01.png"]);

  await list.getByLabel("Sort").selectOption({ label: "Name, A to Z" });
  await expect(names.first()).toHaveText("photo-01.png");
  await expect(list.getByText("Page 1 of 2")).toBeVisible();

  await list.getByRole("group", { name: "Show" }).getByLabel("Public").check({ force: true });
  await expect(list.getByText("4 uploads found")).toBeVisible();

  await list.getByLabel("Search by name").fill("09");
  await expect(names).toHaveText(["photo-09.png"]);

  await list.getByLabel("Search by name").fill("nothing");
  await expect(list.getByText("No uploads match.")).toBeVisible();
  await list.getByRole("button", { name: "Show all uploads" }).click();
  await expect(list.getByText("12 uploads")).toBeVisible();
});

test("the storage meter splits use by type and warns when nearly full", async ({ page, api }) => {
  api.loggedInAs();
  api.quotaIs(100 * 1024 * 1024);
  api.hasUpload("film.mp4", { fileSize: 90 * 1024 * 1024 });
  api.hasUpload("song.mp3", { fileSize: 2 * 1024 * 1024 });
  await page.goto("/upload");

  const storage = board(page, "Storage");
  await expect(storage.getByRole("meter", { name: "Storage used" })).toHaveAttribute(
    "aria-valuetext",
    "92 MB of 100 MB"
  );
  await expect(storage.getByText("Your storage is almost full: 8 MB left.")).toBeVisible();
  const byType = storage.getByRole("list", { name: "Storage by file type" });
  await expect(byType.getByRole("listitem").filter({ hasText: "Videos" })).toContainText("90 MB");

  // Over what's left: the pre-check stops it before anything is sent.
  await page.getByLabel("Files to upload").setInputFiles({
    name: "big.zip",
    mimeType: "application/zip",
    buffer: Buffer.alloc(9 * 1024 * 1024)
  });
  await expect(page.getByText("This upload would go over your storage quota.")).toBeVisible();
  expect(api.uploads).toHaveLength(2);
});
