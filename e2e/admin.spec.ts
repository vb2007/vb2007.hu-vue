import { expect, test } from "./fixtures";

const GB = 1024 ** 3;

test("the admin area stays hidden from everyone but the superuser", async ({ page, api }) => {
  await page.goto("/admin");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();

  await page.goto("/admin/system");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();

  api.loggedInAs();
  for (const path of ["/admin", "/admin/users", "/admin/system"]) {
    await page.goto(path);
    await expect(page.getByText("This page is only for the site's admin.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Admin", exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Users/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Users" })).toHaveCount(0);
  }
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
  await expect(page.getByText("Only anna and the admin")).toBeVisible();
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

test("the superuser finds and removes a pending registration", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasPendingRegistration("old@example.com", { expiresInMinutes: -30 });
  api.hasPendingRegistration("anna@example.com");
  api.hasPendingRegistration("milo@example.com", { expiresInMinutes: 60 });

  await page.goto("/admin");
  await page.getByRole("link", { name: /^System/ }).click();

  await expect(page).toHaveURL(/\/admin\/system$/);
  await expect(page.getByRole("heading", { level: 1, name: "System" })).toBeVisible();
  await expect(page.locator(".bar__admin")).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("3 pending registrations")).toBeVisible();
  // The newest sign-ups first, and the one past its time marked.
  const rows = page.locator(".row");
  await expect(rows.locator(".row__email")).toHaveText([
    "anna@example.com",
    "milo@example.com",
    "old@example.com"
  ]);
  await expect(rows.nth(1)).toContainText("Expires");
  await expect(rows.nth(2).getByText("Expired")).toBeVisible();

  await page.getByLabel("Search by e-mail").fill("mil");
  await expect(page.getByText("1 pending registration found")).toBeVisible();
  await page.getByLabel("Search by e-mail").fill("nobody");
  await expect(page.getByText("No address matches that search.")).toBeVisible();
  await page.getByRole("button", { name: "Show all" }).click();
  await expect(page.getByText("3 pending registrations")).toBeVisible();

  await page.getByRole("button", { name: "Delete anna@example.com" }).click();
  await page.getByRole("button", { name: "Confirm delete anna@example.com" }).click();
  await expect(page.getByText("2 pending registrations")).toBeVisible();
  await expect(rows.locator(".row__email")).toHaveText(["milo@example.com", "old@example.com"]);
  expect(api.adminPendingRegistrations.map((item) => item.email)).toEqual([
    "old@example.com",
    "milo@example.com"
  ]);
});

test("the superuser lifts a log-in lockout with the e-mail and the IP", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.countsRateLimit("loginPerAccount", { email: "anna@example.com", ip: "203.0.113.7" });
  api.countsRateLimit("loginPerIp", { ip: "203.0.113.7" });
  api.countsRateLimit("codeChecksPerEmail", { email: "anna@example.com" });

  await page.goto("/admin/system");
  await expect(page.getByText("so lifting it needs both")).toBeVisible();
  const email = page.getByLabel("E-mail", { exact: true });
  const ip = page.getByLabel("IP address");
  const clear = page.getByRole("button", { name: "Clear rate limits" });

  // Blocked until the form passes, but pressing it shows why.
  await expect(clear).toHaveAttribute("aria-disabled", "true");
  await clear.click({ force: true });
  await expect(page.getByText("Enter an e-mail address, an IP or both.")).toBeVisible();
  await expect(email).toBeFocused();

  // The e-mail alone leaves the lockout of the address from one IP.
  await email.fill("Anna@example.com");
  await clear.click();
  const notice = page.locator(".status--success");
  await expect(notice).toContainText("Cleared for Anna@example.com:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Wrong sign-up and password reset codes for the address."
  ]);

  await ip.fill("203.0.113");
  await clear.click({ force: true });
  await expect(page.getByText("That isn't an IPv4 or IPv6 address.")).toBeVisible();
  await expect(ip).toBeFocused();

  await ip.fill("203.0.113.7");
  await clear.click();
  await expect(notice).toContainText("Cleared for Anna@example.com and 203.0.113.7:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Failed log-ins from the IP.",
    "Failed log-ins to the address from the IP."
  ]);

  await clear.click();
  await expect(
    page.getByText(
      "Nothing was counting for Anna@example.com and 203.0.113.7, so there was nothing to clear."
    )
  ).toBeVisible();
  await expect(notice).toHaveCount(0);
});
