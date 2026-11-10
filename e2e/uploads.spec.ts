import type { Page } from "@playwright/test";
import { expect, getFromApi, MOCK_EMAIL, MOCK_PASSWORD, test } from "./fixtures";

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

test("an upload from a session replaced elsewhere is refused and logs the page out", async ({
  page,
  api
}) => {
  // A real login, so the browser holds a __Host-VB-AUTH cookie the API can replace.
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();
  await page.goto("/upload");
  await expect(page.getByText("No uploads yet.")).toBeVisible();

  // A login on another device replaces this session: unlike reading a paste, an upload needs one.
  api.replacesSession();
  await page
    .getByLabel("Files to upload")
    .setInputFiles([{ name: "holiday.png", mimeType: "image/png", buffer: Buffer.alloc(4096) }]);

  await expect(page.getByText("Only logged-in users can upload files.")).toBeVisible();
  expect(api.uploads).toHaveLength(0);
});

test("an upload after the account was suspended logs the page out", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("mallory@example.com", "mallory");
  const account = api.hasUser("mallory");
  await page.goto("/upload");
  await expect(page.getByText("No uploads yet.")).toBeVisible();

  // The admin suspends the account behind the page's back, which ends its session.
  account.suspendedAt = "2026-10-12T09:00:00.000Z";
  await page
    .getByLabel("Files to upload")
    .setInputFiles([{ name: "holiday.png", mimeType: "image/png", buffer: Buffer.alloc(4096) }]);

  await expect(page.getByText("Only logged-in users can upload files.")).toBeVisible();
  expect(api.uploads).toHaveLength(0);
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toBeVisible();
});

/**
 * Drops the next upload's connection before the API answers, as a browser can when the API answers
 * an upload early (an ended session's 403, an over-limit 413) and closes the connection while the
 * file is still being sent (vb2007/vb2007.hu-api#451, #455). Everything else goes on to the mock.
 */
const dropUploadConnection = (page: Page) =>
  page.route(
    (url) => url.pathname === "/upload",
    (route) =>
      route.request().method() === "POST" ? route.abort("connectionreset") : route.fallback()
  );

test("an upload whose connection drops after the session ended logs the page out", async ({
  page,
  api,
  isMobile
}) => {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(MOCK_EMAIL);
  await page.getByLabel("Password").fill(MOCK_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Login successful!")).toBeVisible();
  await page.goto("/upload");
  await expect(page.getByText("No uploads yet.")).toBeVisible();

  // The session ends behind the page's back, and the API's 403 never reaches the upload.
  api.replacesSession();
  await dropUploadConnection(page);
  await page
    .getByLabel("Files to upload")
    .setInputFiles([{ name: "holiday.png", mimeType: "image/png", buffer: Buffer.alloc(4096) }]);

  // The page is logged out, which a plain connection error would leave alone.
  await expect(page.getByText("Only logged-in users can upload files.")).toBeVisible();
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Log in" })).toBeVisible();
  await expect(page.getByText("Error connecting to server")).toHaveCount(0);
  expect(api.uploads).toHaveLength(0);
});

test("an upload whose connection drops with the session alive reports the connection error", async ({
  page,
  api
}) => {
  api.loggedInAs();
  await page.goto("/upload");
  await expect(page.getByText("No uploads yet.")).toBeVisible();

  await dropUploadConnection(page);
  await page
    .getByLabel("Files to upload")
    .setInputFiles([{ name: "holiday.png", mimeType: "image/png", buffer: Buffer.alloc(4096) }]);

  const queue = page.getByRole("region", { name: "On the way" });
  await expect(queue.getByText("Error connecting to server")).toBeVisible();
  await expect(page.getByText("Only logged-in users can upload files.")).toHaveCount(0);
  expect(api.uploads).toHaveLength(0);
});

test("a user renames, re-scopes and deletes an upload", async ({ page, api }) => {
  api.loggedInAs();
  api.hasUpload("report.pdf", { fileSize: 50_000 });
  await page.goto("/upload");

  const list = board(page, "Your uploads");
  await list.getByRole("button", { name: "report.pdf" }).click();
  await expect(
    list.getByText("You, the admin, and anyone with the link (until it expires)")
  ).toBeVisible();

  await list.getByRole("button", { name: "Rename" }).click();
  await list.getByLabel("New name").fill("annual report.pdf");
  await list.getByLabel("New name").press("Enter");
  await expect(list.getByRole("button", { name: "annual report.pdf" })).toBeVisible();
  expect(api.uploads[0].originalFileName).toBe("annual report.pdf");

  await list.getByRole("button", { name: "Make public" }).click();
  await expect(list.getByText("Anyone with the link, while it's public")).toBeVisible();
  expect(api.uploads[0].visibility).toBe("public");

  await list.getByRole("button", { name: "Delete", exact: true }).click();
  await list.getByRole("button", { name: "Confirm delete" }).click();
  await expect(list.getByText("No uploads yet.")).toBeVisible();
  expect(api.uploads).toEqual([]);
  await expect(page.getByText("0 bytes of 10 GB used")).toBeVisible();
});

const SIGNED_LINK =
  /^https:\/\/cdn\.e2e\.invalid\/useruploads\/a{24}\/0{23}1\.pdf\?expires=(\d+)&sig=[\w-]+$/;
const MINUTE = 60_000;

test("a private link reads without its signature, copies with it and is renewed before it runs out", async ({
  page,
  api,
  context
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.clock.install();
  api.loggedInAs();
  api.hasUpload("report.pdf");
  await page.goto("/upload");

  const list = board(page, "Your uploads");
  await list.getByRole("button", { name: "report.pdf" }).click();
  const link = list.locator(".facts .link");
  await expect(link).toHaveText(/^cdn\.e2e\.invalid\/useruploads\/a+\/0000…0001\.pdf$/);
  await expect(link).toHaveAttribute("title", api.uploads[0].url);

  const copiedLink = async () => {
    await list.getByRole("button", { name: "Copy link" }).click();
    await expect(list.getByRole("button", { name: "Copied" })).toBeVisible();
    const copied = String(await page.evaluate("navigator.clipboard.readText()"));
    expect(copied).toMatch(SIGNED_LINK);
    await expect(list.getByText(/^The copied link expires at \d/)).toBeVisible();
    return copied;
  };
  const first = await copiedLink();
  await expect(list.getByRole("link", { name: /^Open/ })).toHaveAttribute("href", first);

  // Ten minutes before the link expires, the list asks for a new one.
  const reload = page.waitForRequest((request) => new URL(request.url()).pathname === "/uploads");
  api.clockRunsFor(50 * MINUTE);
  await page.clock.fastForward(50 * MINUTE);
  await reload;
  await expect(list.getByRole("link", { name: /^Open/ })).not.toHaveAttribute("href", first);
  await expect(link).toHaveText(/^cdn\.e2e\.invalid\/useruploads\/a+\/0000…0001\.pdf$/);

  const renewed = await copiedLink();
  const expiresOf = (url: string) => Number(SIGNED_LINK.exec(url)![1]);
  expect(expiresOf(renewed) - expiresOf(first)).toBeGreaterThanOrEqual(50 * 60);
});

test("a just-uploaded private file's ticket keeps a working link", async ({ page, api }) => {
  await page.clock.install();
  api.loggedInAs();
  await page.goto("/upload");
  await page.getByLabel("Files to upload").setInputFiles({
    name: "secret.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(1024)
  });

  const queue = page.getByRole("region", { name: "On the way" });
  await expect(queue.getByText("Uploaded · Private")).toBeVisible();
  const ticket = queue.locator(".ticket__link");
  const signed = /^https:\/\/cdn\.e2e\.invalid\/useruploads\/a{24}\/0{23}1\.png\?expires=\d+&sig=/;
  await expect(ticket).toHaveAttribute("href", signed);
  const first = await ticket.getAttribute("href");
  await expect(ticket).toHaveText(/^cdn\.e2e\.invalid\/useruploads\/a+\/0000…0001\.png$/);

  const renew = page.waitForRequest(
    (request) => new URL(request.url()).pathname === `/upload/${api.uploads[0].id}`
  );
  api.clockRunsFor(50 * MINUTE);
  await page.clock.fastForward(50 * MINUTE);
  await renew;
  await expect(ticket).not.toHaveAttribute("href", first!);
  await expect(ticket).toHaveAttribute("href", signed);
});

test("coming back after the links ran out reloads them, the admin's view of a user too", async ({
  page,
  api
}) => {
  await page.clock.install();
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna", { count: 1 });
  api.hasUpload("report.pdf", { owner: "anna" });
  await page.goto(`/admin/users/${api.users[0].id}/uploads`);

  await page.getByRole("button", { name: "report.pdf" }).click();
  const open = page.getByRole("link", { name: /^Open/ });
  await expect(open).toHaveAttribute("href", SIGNED_LINK);
  const first = await open.getAttribute("href");

  // The machine slept: the clock moved on, but no timer fired.
  const reload = page.waitForRequest((request) => request.url().includes("/uploads?"));
  api.clockRunsFor(90 * MINUTE);
  await page.clock.setSystemTime(Date.now() + 90 * MINUTE);
  await page.evaluate('window.dispatchEvent(new Event("focus"))');
  await reload;
  await expect(open).not.toHaveAttribute("href", first!);
  await expect(open).toHaveAttribute("href", SIGNED_LINK);
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

test("the list refuses the queries the API refuses, after the login check", async ({
  page,
  api
}) => {
  api.loggedInAs();
  api.hasUpload("photo.png");
  await page.goto("/upload");
  await expect(board(page, "Your uploads").getByText("1 upload", { exact: true })).toBeVisible();

  const tooLong = "a".repeat(101);
  // Checked in the API's order: limit, page, sortBy, sortOrder, visibility, then q.
  for (const [query, param] of [
    ["limit=0", "limit"],
    ["limit=51", "limit"],
    ["limit=", "limit"],
    ["page=0", "page"],
    ["sortBy=nope", "sortBy"],
    ["sortBy=usedBytes", "sortBy"],
    ["sortOrder=up", "sortOrder"],
    ["visibility=everyone", "visibility"],
    ["visibility=", "visibility"],
    [`q=${tooLong}`, "q"],
    // A repeated parameter reaches the API as an array.
    ["sortBy=fileSize&sortBy=fileSize", "sortBy"],
    [`q=${tooLong}&visibility=all&page=0`, "page"],
    ["page=0&limit=0", "limit"],
    ["sortOrder=up&sortBy=nope", "sortBy"],
    ["visibility=all&sortOrder=up", "sortOrder"],
    [`q=${tooLong}&visibility=all`, "visibility"]
  ]) {
    expect(await getFromApi(page, api, `/uploads?${query}`), query).toEqual({
      status: 400,
      body: { error: `Invalid value for ${param}.` }
    });
  }
  const valid = await getFromApi(
    page,
    api,
    "/uploads?limit=50&page=1&sortBy=originalFileName&sortOrder=asc&visibility=public&q="
  );
  expect(valid.status).toBe(200);

  api.loggedOut();
  expect(await getFromApi(page, api, "/uploads?limit=51")).toEqual({
    status: 403,
    body: { error: "You must be logged in to perform this action." }
  });
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
