import { expect, test } from "./fixtures";

const GB = 1024 ** 3;

test("the admin area stays hidden from everyone but the superuser", async ({ page, api }) => {
  await page.goto("/admin");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();

  api.loggedInAs();
  for (const path of ["/admin", "/admin/users"]) {
    await page.goto(path);
    await expect(page.getByText("This page is only for the site's admin.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Users/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  }
});

test("the overview shows the site's totals and today's mail", async ({ page, api }) => {
  const MB = 1024 ** 2;
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("vb2007");
  api.hasUser("anna");
  api.hasUser("milo");
  api.hasPaste("first");
  api.hasPaste("second", "anna");
  api.hasShortLink("abc123", "https://example.com/");
  api.hasUpload("flyer.pdf", { visibility: "public", owner: "anna", fileSize: 3 * MB });
  api.hasUpload("notes.txt", { owner: "milo", fileSize: 1 * MB });
  api.hasUpload("photo.png", { owner: "milo", fileSize: 1 * MB });
  api.sentMailToday(12);

  await page.goto("/admin");
  const board = page.locator(".board", {
    has: page.getByRole("heading", { level: 2, name: "Site" })
  });
  const row = (label: string, part = "Totals") =>
    board
      .getByRole("region", { name: part })
      .locator(".ledger__row", { hasText: new RegExp(`^${label}`) });
  await expect(row("Users").locator("dd")).toHaveText("3");
  await expect(row("Pastes").locator("dd")).toHaveText("2");
  await expect(row("Short links").locator("dd")).toHaveText("1");
  await expect(row("Uploads")).toContainText("1 public, 2 private");
  await expect(row("Uploads").locator("dd")).toHaveText("3");
  await expect(row("Stored").locator("dd")).toHaveText("5 MB");
  await expect(row("Sign-ups waiting").locator("dd")).toHaveText("0");
  await expect(row("Default quota", "Upload settings").locator("dd")).toHaveText("10 GB");
  await expect(row("Largest file", "Upload settings").locator("dd")).toHaveText("100 MB");

  const mail = board.getByRole("region", { name: "Mail today" });
  await expect(mail.getByText("12 of 250 sent")).toBeVisible();
  await expect(mail.getByRole("meter", { name: "Mail sent today" })).toHaveAttribute(
    "aria-valuenow",
    "12"
  );
  await expect(mail.getByRole("listitem")).toHaveText([
    "200 Sign-up codes stop",
    "200 The API logs a warning",
    "250 All mail stops"
  ]);
  await expect(mail.getByText(/since midnight UTC or its last restart/)).toBeVisible();

  // The sections still follow, under their own heading.
  await expect(page.getByRole("heading", { level: 2, name: "Sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Users/ })).toBeVisible();

  // Past the sign-up stop, then at the limit.
  api.sentMailToday(205);
  await page.reload();
  await expect(mail.getByText("205 of 250 sent")).toBeVisible();
  await expect(mail.getByRole("status")).toHaveText(
    /^Sign-up codes have stopped until midnight UTC or the API's next restart\. /
  );

  api.sentMailToday(250);
  await page.reload();
  await expect(mail.getByRole("listitem").last()).toHaveText("250 All mail stops Reached");
  await expect(mail.getByRole("alert")).toHaveText(
    /^Today's mail limit is used up: no mail goes out until midnight UTC \(.+ your time\) or the API's next restart\.$/
  );
});

test("the overview's totals and mail fail on their own, and Refresh tries again", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna");
  api.statsFail();
  api.sentMailToday(3);

  await page.goto("/admin");
  await expect(page.getByText(/^Failed to load the site's totals/)).toBeVisible();
  await expect(page.getByText("3 of 250 sent")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Users/ })).toBeVisible();

  api.statsFail(false);
  api.sentMailToday(4);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByText(/^Failed to load the site's totals/)).toHaveCount(0);
  await expect(page.locator(".ledger__row", { hasText: /^Users/ }).locator("dd")).toHaveText("1");
  await expect(page.getByText("4 of 250 sent")).toBeVisible();
});

test("logging out on an admin page leaves the gate in full view", async ({
  page,
  api,
  isMobile
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna", { usedBytes: 3 * GB, count: 2 });

  for (const path of ["/admin", "/admin/users"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
    // Playwright counts a transparent element as visible, so check the page faded all the way in.
    const gate = page.locator("main section.page");
    await expect(gate).toHaveCount(1);
    await expect(gate).not.toHaveClass(/route-enter/);
    await expect(gate).toHaveCSS("opacity", "1");
    api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  }
});

test("the superuser finds a user and changes their quota", async ({ page, api, isMobile }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("vb2007", { usedBytes: 3 * GB, count: 40 });
  api.hasUser("anna", { usedBytes: 9.5 * GB, count: 120 });
  api.hasUser("milo", { usedBytes: 0.5 * GB, count: 4 });

  await page.goto("/");
  if (isMobile) await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("link", { name: "Admin", exact: true }).click();

  // The overview: one key per section.
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  const adminKey = page.locator(".bar__admin");
  await expect(adminKey).toHaveAttribute("aria-current", "page");
  await page.getByRole("link", { name: /^Users/ }).click();

  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
  // Still in the admin area, so the navbar's Admin key stays lit.
  await expect(adminKey).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("3 users")).toBeVisible();
  // Most storage used comes first.
  const names = page.locator(".row__name");
  await expect(names).toHaveText(["anna", "vb2007", "milo"]);

  await page.getByLabel("Sort").selectOption({ label: "Name, A to Z" });
  await expect(names).toHaveText(["anna", "milo", "vb2007"]);

  await page.getByLabel("Search by username").fill("ann");
  await expect(page.getByText("1 user found")).toBeVisible();

  await page.getByRole("button", { name: "anna" }).click();
  await expect(page.getByText("9.5 GB of 10 GB")).toBeVisible();
  await page.getByLabel("New quota").fill("5");
  await expect(page.getByText("That's less than anna uses now.")).toBeVisible();
  await page.getByLabel("New quota").fill("25");
  await page.getByRole("button", { name: "Save quota" }).click();

  await expect(page.getByText("Quota set to 25 GB.")).toBeVisible();
  await expect(page.getByText("9.5 GB of 25 GB")).toBeVisible();
  await expect(page.getByText("Custom quota")).toBeVisible();
  expect(api.users[1].uploads).toMatchObject({ quotaBytes: 25 * GB, hasCustomQuota: true });

  await page.getByRole("button", { name: "Use default" }).click();
  await expect(page.getByText("Back on the default quota, 10 GB.")).toBeVisible();
  await expect(page.getByText("Custom quota")).toHaveCount(0);
  expect(api.users[1].uploads.hasCustomQuota).toBe(false);
});

test("the superuser browses a user's uploads and moderates them", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna", { usedBytes: 3 * GB, count: 2 });
  api.hasUpload("flyer.pdf", { visibility: "public", owner: "anna" });
  api.hasUpload("spam.zip", { visibility: "public", owner: "anna" });
  api.hasUpload("mine.txt", { owner: "vb2007" });

  await page.goto("/admin/users");
  await page.getByRole("button", { name: "anna" }).click();
  await page.getByRole("link", { name: "Browse uploads" }).click();

  await expect(page).toHaveURL(/\/admin\/users\/b+1\/uploads$/);
  await expect(page.getByRole("heading", { level: 1, name: "anna's uploads" })).toBeVisible();
  await expect(page.getByText("2 uploads")).toBeVisible();
  await expect(page.getByRole("button", { name: "mine.txt" })).toHaveCount(0);

  await page.getByRole("button", { name: "flyer.pdf" }).click();
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(
    page.getByText("anna, you, and anyone with the link (until it expires)")
  ).toBeVisible();
  expect(api.uploads[0].visibility).toBe("private");

  await page.getByRole("button", { name: "flyer.pdf" }).click();
  await page.getByRole("button", { name: "spam.zip" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("1 upload", { exact: true })).toBeVisible();
  expect(api.uploads.map((upload) => upload.originalFileName)).toEqual(["flyer.pdf", "mine.txt"]);

  await page.getByRole("link", { name: "All users" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

  await page.getByRole("link", { name: "All sections" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
});

test("the admin's view of a user's uploads names them while loading and on failure", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna", { usedBytes: 3 * GB, count: 1 });
  api.hasUpload("flyer.pdf", { owner: "anna" });
  const release = api.holdsUserUploads();

  await page.goto("/admin/users");
  await page.getByRole("button", { name: "anna" }).click();
  await page.getByRole("link", { name: "Browse uploads" }).click();

  // The name comes with the link, so it shows before the API answers.
  await expect(page.getByText("Loading anna's uploads…")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "anna's uploads" })).toBeVisible();
  release();
  await expect(page.getByText("1 upload", { exact: true })).toBeVisible();

  api.userUploadsFail();
  await page.getByRole("link", { name: "All users" }).click();
  await page.getByRole("button", { name: "anna" }).click();
  await page.getByRole("link", { name: "Browse uploads" }).click();
  await expect(page.getByText(/^Failed to load anna's uploads: /)).toBeVisible();

  // A direct visit has no name to go on until the API gives one. (Not from the same address: the
  // browser treats that as a reload, which keeps the history state.)
  await page.goto("/");
  await page.goto(`/admin/users/${api.users[0].id}/uploads`);
  await expect(page.getByText(/^Failed to load this user's uploads: /)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Uploads" })).toBeVisible();
});
