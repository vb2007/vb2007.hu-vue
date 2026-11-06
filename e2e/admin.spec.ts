import { expect, test } from "./fixtures";

const GB = 1024 ** 3;

test("the admin area stays hidden from everyone but the superuser", async ({ page, api }) => {
  await page.goto("/admin");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();

  api.loggedInAs();
  for (const path of ["/admin", "/admin/users", `/admin/users/${"b".repeat(24)}`]) {
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

  // The search matches part of the e-mail address too.
  const search = page.getByLabel("Search by username or e-mail");
  await search.fill("MILO@exa");
  await expect(page.getByText("1 user found")).toBeVisible();
  await expect(names).toHaveText(["milo"]);
  await search.fill("nobody");
  await expect(page.getByText("No username or e-mail address matches that search.")).toBeVisible();

  await search.fill("ann");
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

test("the superuser opens a user's page from the list", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("milo", { usedBytes: 0.5 * GB, count: 4 });
  const anna = api.hasUser("anna", {
    usedBytes: 12 * GB,
    count: 2,
    suspendedAt: "2026-11-05T09:00:00.000Z",
    githubLogin: "anna-gh",
    password: false
  });
  api.hasPaste("hello", "anna");
  api.hasPaste("again", "anna");
  api.hasShortLink("annas", "https://example.com/", "anna");
  api.hasUpload("flyer.pdf", { owner: "anna" });

  await page.goto("/admin/users");
  await expect(
    page.locator(".row").filter({ hasText: "anna" }).getByText("Suspended")
  ).toBeVisible();
  // One click from the closed row; each row's link names its account for screen readers.
  await expect(page.getByRole("link", { name: "View account: milo" })).toBeVisible();
  await page.getByRole("link", { name: "View account: anna" }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/users/${anna.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  // Still in the admin area, so the navbar's Admin key stays lit.
  await expect(page.locator(".bar__admin")).toHaveAttribute("aria-current", "true");
  const fact = (label: string) =>
    page
      .locator(".fact")
      .filter({ has: page.locator("dt").getByText(label, { exact: true }) })
      .locator("dd");
  await expect(fact("E-mail")).toHaveText(/anna@example\.com\s+\(not confirmed\)/);
  await expect(fact("Password")).toHaveText("None: logs in with GitHub only");
  await expect(fact("GitHub")).toHaveText("@anna-gh");
  await expect(fact("Suspended")).toHaveText(/Since .+: they can't log in\./);
  await expect(fact("Owns")).toHaveText("2 pastes · 1 short link · 2 uploads");
  await expect(page.locator(".tag", { hasText: "Suspended" })).toBeVisible();

  // Over the quota: the meter is full and the page says by how much.
  await expect(page.getByText("12 GB of 10 GB")).toBeVisible();
  await expect(page.getByText("Over by 2 GB.")).toBeVisible();
  await page.getByLabel("New quota").fill("20");
  await page.getByRole("button", { name: "Save quota" }).click();
  await expect(page.getByText("Quota set to 20 GB.")).toBeVisible();
  await expect(page.getByText("12 GB of 20 GB")).toBeVisible();
  await expect(page.getByText("Over by")).toHaveCount(0);
  expect(anna.uploads).toMatchObject({ quotaBytes: 20 * GB, hasCustomQuota: true });
  // The details stay once the quota's answer is in.
  await expect(fact("GitHub")).toHaveText("@anna-gh");

  await page.getByRole("link", { name: "Browse uploads" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "anna's uploads" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();

  await page.getByRole("link", { name: "All users" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
});

test("a user page shows a waiting e-mail change beside the confirmed address", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const milo = api.hasUser("milo", { emailVerified: true, pendingEmail: "milo@new.example" });

  await page.goto(`/admin/users/${milo.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "milo" })).toBeVisible();
  const fact = (label: string) =>
    page
      .locator(".fact")
      .filter({ has: page.locator("dt").getByText(label, { exact: true }) })
      .locator("dd");
  // The current address keeps its badge: the new one has a row of its own.
  await expect(fact("E-mail")).toHaveText(/milo@example\.com\s+Confirmed/);
  await expect(fact("E-mail").locator(".badge")).toBeVisible();
  await expect(fact("Changing to")).toHaveText(/milo@new\.example\s+\(waiting for its code\)/);
  await expect(fact("Password")).toHaveText("Set");
  await expect(fact("GitHub")).toHaveText("Not linked");
  await expect(fact("Owns")).toHaveText("0 pastes · 0 short links · 0 uploads");
});

test("a user page's link that leads to no account says so", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });

  await page.goto("/admin/users/not-an-id");
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  await expect(
    page.getByText("This link doesn't lead to an account: its ID isn't valid.")
  ).toBeVisible();

  await page.goto(`/admin/users/${"c".repeat(24)}`);
  await expect(
    page.getByText("There's no account with this ID. It may have been deleted.")
  ).toBeVisible();
  await page.getByRole("link", { name: "All users" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
});

test("the superuser renames a user and logs them out everywhere", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  api.hasUser("milo");
  api.hasPaste("hello", "anna");

  await page.goto(`/admin/users/${anna.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await expect(page.locator(".action h3")).toHaveText([
    "Uploads",
    "Rename",
    "Log out everywhere",
    "Delete account"
  ]);

  await page.getByRole("button", { name: "Rename" }).click();
  const field = page.getByLabel("New username");
  await expect(field).toHaveValue("anna");
  await expect(field).toBeFocused();
  const save = page.getByRole("button", { name: "Save username" });
  await expect(save).toBeDisabled();

  // Checked while it's typed, from the API's limits.
  await field.fill("a".repeat(17));
  await expect(
    page.getByText("The username's too long: it must be between 2 and 16 characters.")
  ).toBeVisible();

  // Another account's name, in another case, is taken: the API says so under the field.
  await field.fill("MILO");
  await save.click();
  await expect(page.getByText("This username is already taken.")).toBeVisible();
  await expect(field).toBeFocused();

  await field.fill(" Annabel ");
  await save.click();
  await expect(page.getByText("Renamed to Annabel.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Annabel" })).toBeVisible();
  await expect(field).toHaveCount(0);
  expect(anna.username).toBe("Annabel");

  await expect(
    page.getByText("Ends Annabel's session on every device. They can log in again.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Log out everywhere" }).click();
  await expect(
    page.getByText("Annabel is logged out everywhere. They can log in again.")
  ).toBeVisible();
  expect(api.loggedOutUsers).toEqual([anna.id]);
});

test("the superuser deletes a user with everything they own", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna", { count: 1 });
  api.hasUser("milo");
  api.hasPaste("hello", "anna");
  api.hasShortLink("annas", "https://example.com/", "anna");
  api.hasUpload("flyer.pdf", { owner: "anna" });

  await page.goto(`/admin/users/${anna.id}`);
  await expect(
    page.getByText(
      "Deletes anna's account with its pastes, short links and uploads. It can't be undone."
    )
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete account" }).click();
  // The first click only arms it.
  const confirm = page.getByRole("button", { name: "Confirm delete" });
  await expect(confirm).toBeVisible();
  expect(api.users).toContain(anna);
  await confirm.click();

  await expect(page).toHaveURL(/\/admin\/users$/);
  // The key went with the page, so the focus moves to what happened.
  await expect(
    page.getByText("anna's account is deleted, with its pastes, short links and uploads.")
  ).toBeVisible();
  await expect(page.locator(".status--success")).toBeFocused();
  await expect(page.locator(".row__name")).toHaveText(["milo"]);
  expect(api.pastes).toEqual([]);
  expect(api.shortLinks.size).toBe(0);
  expect(api.uploads).toEqual([]);

  // Said once: a reload doesn't repeat it.
  await page.reload();
  await expect(page.locator(".row__name")).toHaveText(["milo"]);
  await expect(page.getByText("anna's account is deleted")).toHaveCount(0);
});

test("the superuser's own account can't be deleted, and logging it out ends this session", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const own = api.hasUser("vb2007", { superuser: true });

  await page.goto(`/admin/users/${own.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toBeVisible();
  await expect(page.getByText("The superuser's own account can't be deleted.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete account" })).toHaveCount(0);

  await expect(
    page.getByText(
      "This is your account: it ends this session too, so you'll have to log in again."
    )
  ).toBeVisible();
  // Their own session goes too, so it takes a second click; Escape disarms it.
  const key = page.getByRole("button", { name: "Log out everywhere" });
  await key.click();
  const confirm = page.getByRole("button", { name: "Confirm log out" });
  await expect(confirm).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(key).toBeVisible();
  expect(api.loggedOutUsers).toEqual([]);
  await key.click();
  await confirm.click();
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toHaveCount(0);
  expect(api.loggedOutUsers).toEqual([own.id]);
});
