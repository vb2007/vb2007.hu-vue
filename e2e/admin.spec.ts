import { expect, getFromApi, MOCK_PASSWORD, test } from "./fixtures";

const GB = 1024 ** 3;

test("the admin area stays hidden from everyone but the superuser", async ({ page, api }) => {
  await page.goto("/admin");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await page.goto("/admin/users");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  await page.goto("/admin/system");
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();

  api.loggedInAs();
  for (const path of [
    "/admin",
    "/admin/users",
    `/admin/users/${"b".repeat(24)}`,
    "/admin/pastes",
    "/admin/short-links",
    "/admin/uploads",
    "/admin/system"
  ]) {
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

test("the user and upload lists refuse the queries the API refuses", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna", { count: 1 });
  api.hasUpload("flyer.pdf", { owner: "anna" });
  await page.goto("/admin/users");
  await expect(page.getByRole("button", { name: "anna" })).toBeVisible();

  const refused = (param: string) => ({
    status: 400,
    body: { error: `Invalid value for ${param}.` }
  });
  const tooLong = "a".repeat(101);
  // Each list checks limit, page, sortBy, sortOrder, (visibility,) then q: the first bad one is named.
  const everyList: [query: string, param: string][] = [
    ["limit=0", "limit"],
    ["limit=51", "limit"],
    ["limit=", "limit"],
    ["limit=1.5", "limit"],
    ["page=0", "page"],
    ["page=one", "page"],
    ["sortBy=nope", "sortBy"],
    ["sortBy=", "sortBy"],
    ["sortOrder=up", "sortOrder"],
    [`q=${tooLong}`, "q"],
    // A repeated parameter reaches the API as an array.
    ["limit=10&limit=20", "limit"],
    ["q=a&q=b", "q"],
    [`q=${tooLong}&sortBy=nope&page=0`, "page"],
    ["sortOrder=up&limit=51", "limit"]
  ];
  const uploadLists: [query: string, param: string][] = [
    ...everyList,
    ["sortBy=username", "sortBy"],
    ["visibility=everyone", "visibility"],
    ["visibility=", "visibility"],
    ["visibility=public&visibility=private", "visibility"],
    [`q=${tooLong}&visibility=all`, "visibility"],
    ["visibility=all&sortOrder=up", "sortOrder"]
  ];
  const lists: [path: string, checks: [string, string][]][] = [
    ["/admin/users", [...everyList, ["sortBy=uploadedOn", "sortBy"]]],
    [`/admin/users/${anna.id}/uploads`, uploadLists],
    ["/admin/uploads", uploadLists]
  ];
  for (const [path, checks] of lists) {
    for (const [query, param] of checks) {
      expect(await getFromApi(page, api, `${path}?${query}`), `${path}?${query}`).toEqual(
        refused(param)
      );
    }
  }

  // Every rule's edge passes, and so does an empty search.
  const users = await getFromApi(
    page,
    api,
    `/admin/users?limit=50&page=1&sortBy=createdAt&sortOrder=asc&q=`
  );
  expect(users.status).toBe(200);
  for (const path of [`/admin/users/${anna.id}/uploads`, "/admin/uploads"]) {
    const uploads = await getFromApi(
      page,
      api,
      `${path}?limit=1&page=1&sortBy=fileSize&sortOrder=asc&visibility=private&q=`
    );
    expect(uploads.status, path).toBe(200);
  }

  // A user's uploads check the ID's format first, then the query, and only then whether the user exists.
  expect(await getFromApi(page, api, "/admin/users/nope/uploads?limit=51")).toEqual({
    status: 400,
    body: { error: "Invalid ID format: must be a 24 character HEX string." }
  });
  expect(await getFromApi(page, api, `/admin/users/${"c".repeat(24)}/uploads?limit=51`)).toEqual(
    refused("limit")
  );
  expect(
    (await getFromApi(page, api, `/admin/users/${"c".repeat(24)}/uploads?limit=50`)).status
  ).toBe(404);

  // The superuser check comes before any of it.
  api.loggedInAs();
  for (const path of ["/admin/users", `/admin/users/${anna.id}/uploads`, "/admin/uploads"]) {
    expect(await getFromApi(page, api, `${path}?limit=51`), path).toEqual({
      status: 403,
      body: { error: "You do not have permission to perform this action." }
    });
  }
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

test("the superuser suspends a user after confirming, then lifts it", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const admin = api.hasUser("vb2007", { superuser: true });
  const anna = api.hasUser("anna");

  await page.goto(`/admin/users/${anna.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await expect(page.locator(".tag", { hasText: "Suspended" })).toHaveCount(0);
  const actions = page.locator(".actions");
  await expect(actions.getByRole("heading", { level: 3 })).toHaveText([
    "Uploads",
    "Rename",
    "Log out everywhere",
    "Suspend account",
    "Delete account"
  ]);

  // It asks first, and backing out sends nothing.
  await actions.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByText("Suspend anna? They're logged out at once")).toBeVisible();
  await expect(page.getByRole("button", { name: "Suspend anna" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Suspend anna" })).toHaveCount(0);
  await expect(actions.getByRole("button", { name: "Suspend", exact: true })).toBeFocused();
  expect(anna.suspendedAt).toBeNull();

  await actions.getByRole("button", { name: "Suspend", exact: true }).click();
  await page.getByRole("button", { name: "Suspend anna" }).click();
  await expect(actions.getByRole("status")).toHaveText(
    "User suspended successfully: their session was ended."
  );
  await expect(page.locator(".tag", { hasText: "Suspended" })).toBeVisible();
  await expect(page.locator(".fact--suspended dd")).toHaveText(/Since .+: they can't log in\./);
  await expect(page.getByRole("button", { name: "Lift suspension" })).toBeFocused();
  expect(anna.suspendedAt).not.toBeNull();

  // The list says so too.
  await page.getByRole("link", { name: "All users" }).click();
  await expect(
    page.locator(".row").filter({ hasText: "anna" }).getByText("Suspended")
  ).toBeVisible();
  await page.goBack();

  await page.getByRole("button", { name: "Lift suspension" }).click();
  await expect(actions.getByRole("status")).toHaveText("User unsuspended successfully.");
  await expect(page.locator(".tag", { hasText: "Suspended" })).toHaveCount(0);
  await expect(page.locator(".fact--suspended")).toHaveCount(0);
  expect(anna.suspendedAt).toBeNull();

  // The admin's own account can't be suspended, so its row only says so.
  await page.goto(`/admin/users/${admin.id}`);
  await expect(page.getByText("The admin's own account can't be suspended.")).toBeVisible();
  await expect(page.locator(".actions").getByRole("button", { name: /Suspend/ })).toHaveCount(0);
});

test("a suspended account is logged out and refused, but only after the right password", async ({
  page,
  api
}) => {
  // Logged in when the suspension came: the session answers as logged out.
  api.loggedInAs("anna@example.com", "anna");
  api.hasUser("anna", { suspendedAt: "2026-11-05T09:00:00.000Z" });
  await page.goto("/account");
  await expect(page.getByText("Log in to see your account.")).toBeVisible();

  await page.goto("/login");
  const main = page.getByRole("main");
  const logIn = main.getByRole("button", { name: "Log in", exact: true });
  await page.getByLabel("E-mail").fill("anna@example.com");
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await logIn.click();
  await expect(main.getByRole("alert")).toHaveText(
    "Incorrect e-mail address or password. If you signed up with GitHub, log in with GitHub."
  );

  await page.getByLabel("Password", { exact: true }).fill(MOCK_PASSWORD);
  await logIn.click();
  await expect(main.getByRole("alert")).toHaveText(
    "This account is suspended: it can't log in until the superuser lifts the suspension."
  );
  await expect(main).not.toContainText("Login successful!");
  const cookies = await page.context().cookies();
  expect(cookies.map((cookie) => cookie.name)).not.toContain("__Host-VB-AUTH");
});

test("a GitHub login into a suspended account is explained", async ({ page }) => {
  await page.goto("/login?oauthError=accountSuspended");

  await expect(page.getByRole("alert")).toHaveText(
    "The account linked to this GitHub account is suspended: it can't log in until the superuser lifts the suspension."
  );
  await expect(page).toHaveURL("/login");
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
    "Suspend account",
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
  const userChecks: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "GET" && new URL(request.url()).pathname === "/user") {
      userChecks.push(request.url());
    }
  });
  await confirm.click();
  await expect(page.getByText("Log in with the admin account to open this page.")).toBeVisible();
  // The page asks once whether the session is gone, and that answer doesn't ask again.
  expect(userChecks).toHaveLength(1);
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toHaveCount(0);
  expect(api.loggedOutUsers).toEqual([own.id]);
});

test("the superuser finds pastes, opens them and deletes one", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  const annas = api.hasPaste("const answer = 42;\nconsole.log(answer);", "anna", "typescript");
  api.hasPaste("print('hi')", "vb2007", "python");
  // No account has this name any more, and it was made before pastes had a language.
  api.hasPaste("left behind", "ghost");

  await page.goto("/admin");
  await page.getByRole("link", { name: /^Pastes/ }).click();

  await expect(page).toHaveURL(/\/admin\/pastes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Pastes" })).toBeVisible();
  await expect(page.locator(".bar__admin")).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("3 pastes")).toBeVisible();
  // Newest first, each by its opening line.
  const previews = page.locator(".row__preview");
  await expect(previews).toHaveText(["left behind", "print('hi')", "const answer = 42;"]);
  await expect(page.locator(".row").filter({ hasText: "left behind" })).toContainText(
    "Deleted account · Plain text ·"
  );
  await expect(page.locator(".row").filter({ hasText: "answer" })).toContainText(
    "anna · TypeScript ·"
  );

  await page.getByLabel("Sort").selectOption({ label: "Oldest first" });
  await expect(previews).toHaveText(["const answer = 42;", "print('hi')", "left behind"]);

  // The search matches part of the language or of the owner's name.
  const search = page.getByLabel("Search by owner or language");
  await search.fill("PYTH");
  await expect(page.getByText("1 paste found")).toBeVisible();
  await expect(previews).toHaveText(["print('hi')"]);
  await search.fill("ann");
  await expect(previews).toHaveText(["const answer = 42;"]);
  await search.fill("cobol");
  await expect(page.getByText("No owner or language matches that search.")).toBeVisible();
  await page.getByRole("button", { name: "Show every paste" }).click();
  await expect(page.getByText("3 pastes")).toBeVisible();

  // The first click arms the key, the second deletes.
  await page.getByRole("button", { name: "Delete the paste of a deleted account" }).click();
  await page.getByRole("button", { name: "Confirm delete the paste of a deleted account" }).click();
  await expect(page.getByText("2 pastes")).toBeVisible();
  await expect(previews).toHaveText(["const answer = 42;", "print('hi')"]);
  expect(api.pastes.map((paste) => paste.content)).not.toContain("left behind");

  // The owner's name leads to their account, the opening line to the paste.
  await page.getByRole("link", { name: "anna", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${anna.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "const answer = 42;" }).click();
  await expect(page).toHaveURL(new RegExp(`/pastebin/${annas._id}$`));
  await expect(page.getByText("console.log(answer);")).toBeVisible();
});

test("deleting the last paste on a page steps back a page", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna");
  for (let i = 1; i <= 21; i++) api.hasPaste(`paste number ${i}`, "anna", "plaintext");

  await page.goto("/admin/pastes");
  await expect(page.getByText("21 pastes")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const previews = page.locator(".row__preview");
  await expect(previews).toHaveText(["paste number 1"]);

  await page.getByRole("button", { name: "Delete anna's paste" }).click();
  await page.getByRole("button", { name: "Confirm delete anna's paste" }).click();

  await expect(page.getByText("20 pastes")).toBeVisible();
  await expect(previews).toHaveCount(20);
  await expect(previews.first()).toHaveText("paste number 21");
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
});

test("the superuser finds short links, checks them and deletes one", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  api.hasShortLink("annas", "https://example.com/flyer", "anna", "2026-10-01T12:00:00.000Z");
  api.hasShortLink("mine", "https://vb2007.hu/", "vb2007", "2026-10-02T12:00:00.000Z");
  // No account has this name any more.
  api.hasShortLink("orphan", "ftp://files.example/pub", "ghost", "2026-10-03T12:00:00.000Z");

  await page.goto("/admin");
  await page.getByRole("link", { name: /^Short links/ }).click();

  await expect(page).toHaveURL(/\/admin\/short-links$/);
  await expect(page.getByRole("heading", { level: 1, name: "Short links" })).toBeVisible();
  await expect(page.locator(".bar__admin")).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("3 short links")).toBeVisible();
  // Newest first, each with where it leads, host first, and whose it is.
  const codes = page.locator(".row__code");
  await expect(codes).toHaveText(["orphan", "mine", "annas"]);
  const row = (code: string) =>
    page.locator(".row").filter({ has: page.getByRole("link", { name: code, exact: true }) });
  await expect(row("orphan").locator(".row__url")).toHaveText("ftp://files.example/pub");
  await expect(row("orphan").locator(".row__host")).toHaveText("files.example");
  await expect(row("orphan")).toContainText("Deleted account ·");
  await expect(row("annas").locator(".row__url")).toHaveText("example.com/flyer");
  await expect(row("annas").locator(".row__target")).toHaveAttribute(
    "title",
    "https://example.com/flyer"
  );

  await page.getByLabel("Sort").selectOption({ label: "Oldest first" });
  await expect(codes).toHaveText(["annas", "mine", "orphan"]);

  // The search matches part of the code, the target or the owner's name.
  const search = page.getByLabel("Search by code, target or owner");
  await search.fill("ANNA");
  await expect(page.getByText("1 short link found")).toBeVisible();
  await expect(codes).toHaveText(["annas"]);
  await search.fill("files.ex");
  await expect(codes).toHaveText(["orphan"]);
  await search.fill("vb2007.hu");
  await expect(codes).toHaveText(["mine"]);
  await search.fill("nowhere");
  await expect(page.getByText("No code, target or owner matches that search.")).toBeVisible();
  await page.getByRole("button", { name: "Show every link" }).click();
  await expect(page.getByText("3 short links")).toBeVisible();

  // The first click arms the key, the second deletes.
  await page.getByRole("button", { name: "Delete orphan" }).click();
  await page.getByRole("button", { name: "Confirm delete orphan" }).click();
  await expect(page.getByText("2 short links")).toBeVisible();
  await expect(codes).toHaveText(["annas", "mine"]);
  // The deleted row took the focused key with it: the one above takes the focus.
  await expect(page.getByRole("button", { name: "Delete mine" })).toBeFocused();
  expect([...api.shortLinks.keys()]).toEqual(["annas", "mine"]);

  // The owner's name leads to their account, the code to the link's preview.
  await page.getByRole("link", { name: "anna", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${anna.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await page.goBack();
  await page.getByRole("link", { name: "annas", exact: true }).click();
  await expect(page).toHaveURL(/\/r\/annas\/preview$/);
  await expect(page.getByText("example.com/flyer").first()).toBeVisible();
});

test("the short links search shows the API's refusal of a NUL character", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasShortLink("annas", "https://example.com/", "vb2007");

  await page.goto("/admin/short-links");
  await expect(page.getByText("1 short link", { exact: true })).toBeVisible();
  await page.getByLabel("Search by code, target or owner").fill("an\0nas");
  await expect(page.getByText("Invalid value for q.")).toBeVisible();
});

test("deleting the last short link on a page steps back a page", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna");
  for (let i = 1; i <= 21; i++) {
    const day = String(i).padStart(2, "0");
    api.hasShortLink(
      `link${day}`,
      `https://example.com/${i}`,
      "anna",
      `2026-10-${day}T12:00:00.000Z`
    );
  }

  await page.goto("/admin/short-links");
  await expect(page.getByText("21 short links")).toBeVisible();
  await expect(page.getByText("Page 1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Page 2 of 2")).toBeVisible();
  const codes = page.locator(".row__code");
  await expect(codes).toHaveText(["link01"]);

  await page.getByRole("button", { name: "Delete link01" }).click();
  await page.getByRole("button", { name: "Confirm delete link01" }).click();

  await expect(page.getByText("20 short links")).toBeVisible();
  await expect(codes).toHaveCount(20);
  await expect(codes.first()).toHaveText("link21");
  await expect(page.getByRole("navigation", { name: "Pages" })).toHaveCount(0);
});

test("the superuser lists every upload with its owner and moderates them", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna", { count: 1 });
  api.hasUser("milo", { count: 1 });
  api.hasUpload("flyer.pdf", { visibility: "public", owner: "anna" });
  api.hasUpload("notes.txt", { owner: "milo" });
  api.hasUpload("mine.txt", { owner: "vb2007" });
  // Its account is gone, so the API names no owner.
  api.hasUpload("left.zip", { owner: "gone" });

  await page.goto("/admin");
  await page.getByRole("link", { name: /^Uploads/ }).click();

  await expect(page).toHaveURL(/\/admin\/uploads$/);
  await expect(page.getByRole("heading", { level: 1, name: "Uploads" })).toBeVisible();
  await expect(page.locator(".bar__admin")).toHaveAttribute("aria-current", "true");
  await expect(page.getByText("4 uploads")).toBeVisible();
  // Newest first, each row led by whose it is.
  const meta = page.locator(".row__meta");
  await expect(meta).toHaveText([/^Deleted account\s· /, /^vb2007\s· /, /^milo\s· /, /^anna\s· /]);

  // Who can open a private file stays true for the admin, on someone else's and on their own.
  await page.getByRole("button", { name: "notes.txt" }).click();
  await expect(
    page.getByText("milo, you, and anyone with the link (until it expires)")
  ).toBeVisible();
  await page.getByRole("button", { name: "notes.txt" }).click();
  await page.getByRole("button", { name: "mine.txt" }).click();
  await expect(page.getByText("You, and anyone with the link (until it expires)")).toBeVisible();
  await page.getByRole("button", { name: "mine.txt" }).click();

  // The search matches the owner's name too.
  const search = page.getByLabel("Search by name or owner");
  await search.fill("MIL");
  await expect(page.getByText("1 upload found")).toBeVisible();
  await expect(page.locator(".row__name")).toHaveText(["notes.txt"]);
  await search.fill("nobody");
  await expect(
    page.getByText("No uploads match. Try another name or owner, or show all of them.")
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all uploads" }).click();
  await expect(page.getByText("4 uploads")).toBeVisible();

  // An edit keeps the row's owner, which its answer leaves out.
  await page.getByRole("button", { name: "flyer.pdf" }).click();
  await page.getByRole("button", { name: "Make private" }).click();
  await expect(
    page.getByText("anna, you, and anyone with the link (until it expires)")
  ).toBeVisible();
  expect(api.uploads[0].visibility).toBe("private");
  await expect(meta.last()).toHaveText(/^anna\s· /);
  await page.getByRole("button", { name: "flyer.pdf" }).click();

  await page.getByRole("button", { name: "left.zip" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByText("3 uploads")).toBeVisible();
  expect(api.uploads.map((upload) => upload.originalFileName)).not.toContain("left.zip");

  // The owner is a click from their account.
  await page.getByRole("link", { name: "anna's account" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${anna.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { level: 1, name: "Uploads" })).toBeVisible();
  await page.getByRole("link", { name: "All sections" }).click();
  await expect(page).toHaveURL(/\/admin$/);
});

test("the site-wide list renews its private links once they run out", async ({ page, api }) => {
  await page.clock.install();
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasUser("anna", { count: 1 });
  api.hasUpload("report.pdf", { owner: "anna" });
  await page.goto("/admin/uploads");

  await page.getByRole("button", { name: "report.pdf" }).click();
  const open = page.getByRole("link", { name: /^Open/ });
  await expect(open).toHaveAttribute("href", /\?expires=\d+&sig=/);
  const first = await open.getAttribute("href");

  // The machine slept: the clock moved on, but no timer fired.
  const reload = page.waitForRequest((request) => request.url().includes("/admin/uploads?"));
  api.clockRunsFor(90 * 60_000);
  await page.clock.setSystemTime(Date.now() + 90 * 60_000);
  await page.evaluate('window.dispatchEvent(new Event("focus"))');
  await reload;
  await expect(open).not.toHaveAttribute("href", first!);
  await expect(open).toHaveAttribute("href", /\?expires=\d+&sig=/);
  await expect(page.getByRole("link", { name: "anna's account" })).toBeVisible();
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
