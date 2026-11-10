import { browserFontSize } from "./browser";
import { callApi, expect, getFromApi, MOCK_PASSWORD, MOCK_SUPERUSER_EMAIL, test } from "./fixtures";

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
    "225 Password reset codes stop",
    "250 All mail stops"
  ]);
  await expect(mail.getByText("188 until sign-up codes stop")).toBeVisible();
  await expect(mail.getByText(/since midnight UTC or its last restart/)).toBeVisible();

  // The sections still follow, under their own heading.
  await expect(page.getByRole("heading", { level: 2, name: "Sections" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Users/ })).toBeVisible();

  // Past the sign-up stop, past the password reset stop, then at the limit.
  api.sentMailToday(205);
  await page.reload();
  await expect(mail.getByText("205 of 250 sent")).toBeVisible();
  await expect(mail.getByText("20 until password reset codes stop")).toBeVisible();
  await expect(mail.getByRole("status")).toHaveText(
    "Sign-up codes have stopped until midnight UTC or the API's next restart. Password reset codes still go out until today's count reaches 225, other mail to existing accounts until it reaches 250."
  );

  api.sentMailToday(230);
  await page.reload();
  await expect(mail.getByText("230 of 250 sent")).toBeVisible();
  await expect(mail.getByRole("listitem").nth(2)).toHaveText(
    "225 Password reset codes stop Reached"
  );
  await expect(mail.getByRole("status")).toHaveText(
    "Sign-up and password reset codes have stopped until midnight UTC or the API's next restart. E-mail change codes and notices still go out until today's count reaches 250."
  );

  api.sentMailToday(250);
  await page.reload();
  await expect(mail.getByRole("listitem").last()).toHaveText("250 All mail stops Reached");
  await expect(mail.getByRole("alert")).toHaveText(
    /^Today's mail limit is used up: no mail goes out until midnight UTC \(.+ your time\) or the API's next restart\.$/
  );
});

// A 320px screen (a 200px rail), the same with a 20px browser font (rings in rem grow, the screen
// doesn't), just past the board's side-by-side breakpoint (840px, a 315px rail) and a desktop
// (a 373px rail).
for (const [width, fontPx] of [
  [320, 16],
  [320, 20],
  [840, 16],
  [1280, 16]
]) {
  test(`the mail line's rings stay apart at ${width}px with a ${fontPx}px font`, async ({
    page,
    api
  }) => {
    // Some thirty counts, each a refresh and a measurement.
    test.slow();
    api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
    api.hasUser("vb2007");
    if (fontPx !== 16) await browserFontSize(page, fontPx);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/admin");
    const mail = page.getByRole("region", { name: "Mail today" });
    await expect
      .poll(() =>
        page
          .locator("html")
          .evaluate((html) => html.ownerDocument.defaultView!.getComputedStyle(html).fontSize)
      )
      .toBe(`${fontPx}px`);
    // Each ring's centre and width (its layout width, which the here ring's arrival doesn't scale).
    const rings = () =>
      mail.evaluate((root) => {
        const all = (selector: string) =>
          [...root.querySelectorAll(selector)].map((el) => {
            const box = el.getBoundingClientRect();
            return {
              centre: box.left + box.width / 2,
              width: parseFloat(root.ownerDocument.defaultView!.getComputedStyle(el).width),
              mark: el.getAttribute("style") ?? ""
            };
          });
        return {
          from: all(".mail__end--from")[0],
          to: all(".mail__end--to")[0],
          here: all(".mail__here").at(0) ?? null,
          marks: all(".mail__mark")
        };
      });
    // The clear rail mailLine keeps between two rings: 0.125rem.
    const margin = fontPx * 0.125;
    // Sub-pixel layout rounding, never a whole pixel.
    const epsilon = 0.05;

    // Around each stop (200, 225, the limit at 250), and close to the terminus. Before the day's
    // first mail and just after, the here ring sits on the departure ring: the line sets out from it.
    const counts = [
      0, 1, 184, 185, 190, 196, 200, 204, 205, 210, 212, 213, 215, 216, 217, 220, 225, 229, 230,
      233, 236, 240, 244, 246, 247, 248, 249, 250
    ];
    const marksAt = new Map<number, string[]>();
    for (const sent of counts) {
      api.sentMailToday(sent);
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(mail.getByText(`${sent} of 250 sent`)).toBeVisible();
      const { from, to, here, marks } = await rings();
      type Ring = (typeof marks)[number];
      const gap = (a: Ring, b: Ring) => Math.abs(a.centre - b.centre);
      const touching = (a: Ring, b: Ring) => (a.width + b.width) / 2;
      const at = `${sent} sent`;
      marksAt.set(
        sent,
        marks.map((mark) => mark.mark)
      );

      for (const [i, mark] of marks.entries()) {
        if (here)
          expect(gap(mark, here), at).toBeGreaterThan(touching(mark, here) + margin - epsilon);
        if (i > 0) {
          expect(gap(mark, marks[i - 1]), at).toBeGreaterThan(
            touching(mark, marks[i - 1]) + margin - epsilon
          );
        }
        expect(gap(mark, from), at).toBeGreaterThan(touching(mark, from));
        expect(gap(mark, to), at).toBeGreaterThan(touching(mark, to));
      }
      if (here) expect(gap(here, to), at).toBeGreaterThan(touching(here, to) - epsilon);
    }

    // Where there's room, the next stop's ring stays on the line as the count comes up to it.
    if (width === 1280) {
      expect(marksAt.get(210)).toContain("--mark: 0.9;");
      expect(marksAt.get(240)).toEqual(["--mark: 0.8;", "--mark: 0.9;"]);
      expect(marksAt.get(248)).toEqual(["--mark: 0.8;", "--mark: 0.9;"]);
    }
  });
}

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
    ["sortOrder=up&limit=51", "limit"],
    ["page=0&limit=0", "limit"],
    ["sortOrder=up&sortBy=nope", "sortBy"]
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
    [
      "/admin/users",
      [...everyList, ["sortBy=uploadedOn", "sortBy"], [`q=${tooLong}&sortOrder=up`, "sortOrder"]]
    ],
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

test("the pending registrations list refuses the queries the API refuses", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.hasPendingRegistration("anna@example.com");
  await page.goto("/admin/system");
  await expect(page.getByText("1 pending registration", { exact: true })).toBeVisible();

  const path = "/admin/pending-registrations";
  const tooLong = "a".repeat(101);
  // Checked in the API's order: limit, page, then q.
  for (const [query, param] of [
    ["limit=0", "limit"],
    ["limit=51", "limit"],
    ["limit=", "limit"],
    ["page=0", "page"],
    ["page=", "page"],
    [`q=${tooLong}`, "q"],
    // A repeated parameter reaches the API as an array.
    ["page=1&page=2", "page"],
    ["q=a&q=b", "q"],
    [`q=${tooLong}&page=0&limit=51`, "limit"],
    [`q=${tooLong}&page=0`, "page"]
  ]) {
    expect(await getFromApi(page, api, `${path}?${query}`), query).toEqual({
      status: 400,
      body: { error: `Invalid value for ${param}.` }
    });
  }
  // The list has no sorting, so the API reads no sortBy or sortOrder at all.
  const valid = await getFromApi(
    page,
    api,
    `${path}?limit=50&page=1&q=&sortBy=nope&sortOrder=up&sortBy=again`
  );
  expect(valid.status).toBe(200);

  // The login and superuser checks come first.
  api.loggedInAs();
  expect(await getFromApi(page, api, `${path}?limit=51`)).toEqual({
    status: 403,
    body: { error: "You do not have permission to perform this action." }
  });
  api.loggedOut();
  expect(await getFromApi(page, api, `${path}?limit=51`)).toEqual({
    status: 403,
    body: { error: "You must be logged in to perform this action." }
  });
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

test("suspending an account voids its waiting reset code, reset links and e-mail change", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna", { pendingEmail: "anna@new.example" });
  const email = "anna@example.com";
  const newPassword = "a new password";

  await page.goto(`/admin/users/${anna.id}`);
  const changingTo = page
    .locator(".fact")
    .filter({ has: page.locator("dt").getByText("Changing to", { exact: true }) });
  await expect(changingTo).toHaveCount(1);
  expect((await callApi(page, api, "POST", "/auth/password-reset", { email })).status).toBe(200);
  const token = api.mailsResetLink(anna.id, email);

  const actions = page.locator(".actions");
  await actions.getByRole("button", { name: "Suspend", exact: true }).click();
  await page.getByRole("button", { name: "Suspend anna" }).click();
  await expect(actions.getByRole("status")).toHaveText(
    "User suspended successfully: their session was ended."
  );

  const code = { email, code: api.passwordResetCode, newPassword };
  expect((await callApi(page, api, "POST", "/auth/password-reset/confirm", code)).status).toBe(400);
  const link = { token, newPassword };
  expect((await callApi(page, api, "POST", "/auth/password-reset/confirm-link", link)).status).toBe(
    400
  );
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "anna" })).toBeVisible();
  await expect(changingTo).toHaveCount(0);
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
  // So are invisible characters and whitespace other than spaces, which the API refuses too.
  const invalid =
    "The username has invalid characters: it can't contain invisible or control characters, or whitespace other than spaces.";
  await field.fill("an\tna");
  await expect(page.getByText(invalid)).toBeVisible();
  await expect(field).toHaveAttribute("aria-invalid", "true");
  expect(
    await callApi(page, api, "PATCH", `/admin/users/${anna.id}`, { username: "an\u200bna" })
  ).toEqual({ status: 400, body: { error: invalid } });

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

test("an account's pastes and short links are its own whatever the case of the name they're filed under", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("Anna");
  api.hasPaste("hello", "anna");
  api.hasShortLink("annas", "https://example.com/", "ANNA");
  const theirs = api.hasPaste("theirs", "milo");

  await page.goto(`/admin/users/${anna.id}`);
  const owns = page
    .locator(".fact")
    .filter({ has: page.locator("dt").getByText("Owns", { exact: true }) })
    .locator("dd");
  await expect(owns).toHaveText("1 paste · 1 short link · 0 uploads");

  // Renamed, she keeps them.
  await page.getByRole("button", { name: "Rename" }).click();
  await page.getByLabel("New username").fill("Annabel");
  await page.getByRole("button", { name: "Save username" }).click();
  await expect(page.getByText("Renamed to Annabel.")).toBeVisible();
  await page.reload();
  await expect(owns).toHaveText("1 paste · 1 short link · 0 uploads");

  // Deleted, they go with her, along with one filed under her new name in another case.
  api.hasPaste("later", "ANNABEL");
  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);
  expect(api.pastes).toEqual([theirs]);
  expect(api.shortLinks.size).toBe(0);
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

test("the site-wide list finds an upload's owner whatever the case of the name it's filed under", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("Anna", { count: 1 });
  api.hasUpload("report.pdf", { owner: "anna" });
  await page.goto("/admin/uploads");

  await page.getByRole("button", { name: "report.pdf" }).click();
  await expect(page.getByRole("link", { name: "Anna's account" })).toBeVisible();

  // Her own uploads page lists it too, as the API's, which keys uploads by id, would.
  await page.goto(`/admin/users/${anna.id}/uploads`);
  await expect(page.getByRole("heading", { level: 1, name: "Anna's uploads" })).toBeVisible();
  await expect(page.getByRole("button", { name: "report.pdf" })).toBeVisible();
});

test("the admin's own address is the superuser's, whatever its row on the list says", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  // A plain row at the admin's address: the API goes by the address.
  const own = api.hasUser("vb2007");
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

  const suspension = await callApi(page, api, "PATCH", `/admin/users/${own.id}/suspension`, {
    suspended: true
  });
  expect.soft(suspension).toEqual({
    status: 409,
    body: { error: "The superuser's account can't be suspended." }
  });
  const deletion = await callApi(page, api, "DELETE", `/admin/users/${own.id}`, {});
  expect.soft(deletion).toEqual({
    status: 409,
    body: { error: "The superuser's own account can't be deleted." }
  });
  expect(own.suspendedAt).toBeNull();
  expect(api.users).toContain(own);
});

test("a row at the admin's address answers as the superuser's", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  // A plain row at the admin's address: the API says whose it is by the address.
  const own = api.hasUser("vb2007");

  await page.goto(`/admin/users/${own.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toBeVisible();
  await expect(page.getByText("The admin's own account can't be suspended.")).toBeVisible();
  await expect(page.locator(".actions").getByRole("button", { name: /Suspend/ })).toHaveCount(0);

  const listed = await getFromApi(page, api, "/admin/users");
  const rows = (listed.body as { users: { id: string; isSuperuser: boolean }[] }).users;
  expect(rows.find((row) => row.id === own.id)?.isSuperuser).toBe(true);
  const quota = await callApi(page, api, "PATCH", `/admin/users/${own.id}/upload-quota`, {
    quotaBytes: null
  });
  expect(quota.body).toMatchObject({ user: { id: own.id, isSuperuser: true } });
  const renamed = await callApi(page, api, "PATCH", `/admin/users/${own.id}`, {
    username: "vb2007"
  });
  expect(renamed.body).toMatchObject({ user: { id: own.id, isSuperuser: true } });
});

test("the superuser's address is the superuser, without being arranged as one", async ({
  page,
  api
}) => {
  // The API knows the superuser by SUPERUSER_EMAIL alone, for the session and for every check.
  api.loggedInAs(MOCK_SUPERUSER_EMAIL, "admin");
  const paste = api.hasPaste("anna's words", "anna", "plaintext");
  api.hasShortLink("annas", "https://example.com/", "anna");
  await page.goto("/");

  const user = await getFromApi(page, api, "/user");
  expect.soft(user.body).toMatchObject({ email: MOCK_SUPERUSER_EMAIL, isSuperuser: true });
  expect.soft((await getFromApi(page, api, "/admin/users")).status).toBe(200);
  const changed = await callApi(page, api, "PATCH", `/paste/${paste._id}`, {
    language: "markdown"
  });
  expect.soft(changed.status).toBe(200);
  expect.soft((await callApi(page, api, "DELETE", "/shortenUrl/annas", {})).status).toBe(200);

  await page.goto("/admin");
  await expect(page.getByRole("link", { name: /^Users/ })).toBeVisible();
});

test("there is one superuser address: arranging the admin's leaves the default an ordinary one", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  // The default superuser's address, which the admin's arranged account now stands in for.
  const other = api.hasUser("admin");
  expect(other.email).toBe(MOCK_SUPERUSER_EMAIL);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();

  const listed = await getFromApi(page, api, "/admin/users");
  const rows = (listed.body as { users: { id: string; isSuperuser: boolean }[] }).users;
  expect.soft(rows.find((row) => row.id === other.id)?.isSuperuser).toBe(false);
  const suspension = await callApi(page, api, "PATCH", `/admin/users/${other.id}/suspension`, {
    suspended: true
  });
  expect(suspension.status).toBe(200);
});

test("a listed account's address is stored normalized", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("Anna");
  await page.goto(`/admin/users/${anna.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "Anna" })).toBeVisible();

  const shown = await getFromApi(page, api, `/admin/users/${anna.id}`);
  expect.soft(shown.body).toMatchObject({ user: { email: "anna@example.com" } });
  const fact = page
    .locator(".fact")
    .filter({ has: page.locator("dt").getByText("E-mail", { exact: true }) })
    .locator("dd");
  await expect(fact).toHaveText(/^anna@example\.com/);
});

test("an account's upload usage is the uploads it owns, unless arranged", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const own = api.hasUser("vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  // An arranged usage stands in for both numbers, whatever the account owns.
  const milo = api.hasUser("milo", { count: 7 });
  api.hasUpload("notes.txt", { fileSize: 2048 });
  // Filed under another case of the name, it's still hers.
  api.hasUpload("flyer.pdf", { fileSize: 3000, owner: "VB2007" });
  api.hasUpload("theirs.pdf", { fileSize: 10_000, owner: "anna" });
  api.hasUpload("milos.zip", { fileSize: 99_999, owner: "milo" });
  await page.goto(`/admin/users/${own.id}`);
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toBeVisible();

  // The API's `calculateUploadUsage` derives both from the same uploads, for the page and the list.
  const shown = await getFromApi(page, api, `/admin/users/${own.id}`);
  expect.soft(shown.body).toMatchObject({
    user: { uploads: { count: 2, usedBytes: 5048 }, counts: { uploads: 2 } }
  });
  const listed = await getFromApi(page, api, "/admin/users?sortBy=usedBytes&sortOrder=desc");
  const rows = (
    listed.body as { users: { id: string; uploads: { count: number; usedBytes: number } }[] }
  ).users;
  expect.soft(rows.map((row) => [row.id, row.uploads.count, row.uploads.usedBytes])).toEqual([
    [anna.id, 1, 10_000],
    [own.id, 2, 5048],
    [milo.id, 7, 0]
  ]);
  const owns = page
    .locator(".fact")
    .filter({ has: page.locator("dt").getByText("Owns", { exact: true }) })
    .locator("dd");
  await expect(owns).toHaveText("0 pastes · 0 short links · 2 uploads");
});

test("arranging a second superuser address fails the test at once", ({ api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  // The same address again is the same superuser.
  api.hasUser("vb2007", { superuser: true });
  expect(() => api.hasUser("anna", { superuser: true })).toThrow(
    "The superuser is already arranged as vb2007@example.com"
  );
  expect(() => api.loggedInAs("anna@example.com", "anna", { superuser: true })).toThrow(
    "The superuser is already arranged as vb2007@example.com"
  );
});

test("a deleted account's confirmed address isn't carried to the next account there", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  const email = "anna@example.com";
  const newPassword = "a new password";
  await page.goto(`/admin/users/${anna.id}`);
  // A reset by code confirms the address.
  expect((await callApi(page, api, "POST", "/auth/password-reset", { email })).status).toBe(200);
  const code = { email, code: api.passwordResetCode, newPassword };
  expect((await callApi(page, api, "POST", "/auth/password-reset/confirm", code)).status).toBe(200);

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  // A new account at the same address starts unconfirmed.
  api.hasUser("anna");
  const login = await callApi(page, api, "POST", "/auth/login", { email, password: newPassword });
  expect(login.status).toBe(200);
  expect((await getFromApi(page, api, "/user")).body).toMatchObject({
    email,
    emailVerified: false
  });
});

test("a deleted account's waiting reset code and links go with it", async ({ page, api }) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const anna = api.hasUser("anna");
  const email = "anna@example.com";
  const newPassword = "a new password";
  await page.goto(`/admin/users/${anna.id}`);
  expect((await callApi(page, api, "POST", "/auth/password-reset", { email })).status).toBe(200);
  const token = api.mailsResetLink(anna.id, email);

  await page.getByRole("button", { name: "Delete account" }).click();
  await page.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page).toHaveURL(/\/admin\/users$/);

  const code = { email, code: api.passwordResetCode, newPassword };
  expect((await callApi(page, api, "POST", "/auth/password-reset/confirm", code)).status).toBe(400);
  const link = { token, newPassword };
  expect((await callApi(page, api, "POST", "/auth/password-reset/confirm-link", link)).status).toBe(
    400
  );
});

test("the owner link of the admin's own upload leads to their row on the list", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  // The list's row at the admin's address, with an id of its own.
  const own = api.hasUser("vb2007", { count: 1 });
  api.hasUpload("mine.txt");
  await page.goto("/admin/uploads");

  await page.getByRole("button", { name: "mine.txt" }).click();
  await page.getByRole("link", { name: "vb2007's account" }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/users/${own.id}$`));
  await expect(page.getByRole("heading", { level: 1, name: "vb2007" })).toBeVisible();
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

test("the superuser lifts a log-in lockout from one IP, or from every IP with the e-mail alone", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  api.countsRateLimit("loginPerAccount", { email: "anna@example.com", ip: "203.0.113.7" });
  api.countsRateLimit("loginPerAccount", { email: "anna@example.com", ip: "198.51.100.9" });
  api.countsRateLimit("loginPerIp", { ip: "203.0.113.7" });
  api.countsRateLimit("codeChecksPerEmail", { email: "anna@example.com" });

  await page.goto("/admin/system");
  await expect(page.getByText("lifts its log-in lockout from every IP")).toBeVisible();
  const email = page.getByLabel("E-mail", { exact: true });
  const ip = page.getByLabel("IP address");
  const clear = page.getByRole("button", { name: "Clear rate limits" });

  // Blocked until the form passes, but pressing it shows why.
  await expect(clear).toHaveAttribute("aria-disabled", "true");
  await clear.click({ force: true });
  await expect(page.getByText("Enter an e-mail address, an IP or both.")).toBeVisible();
  await expect(email).toBeFocused();

  await email.fill("Anna@example.com");
  await ip.fill("203.0.113");
  await clear.click({ force: true });
  await expect(page.getByText("That isn't an IPv4 or IPv6 address.")).toBeVisible();
  await expect(ip).toBeFocused();

  // With the IP, only that IP's lockout of the address goes (and what the e-mail or the IP alone keys).
  await ip.fill("203.0.113.7");
  await clear.click();
  const notice = page.locator(".status--success");
  await expect(notice).toContainText("Cleared for Anna@example.com and 203.0.113.7:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Failed log-ins from the IP.",
    "Failed log-ins to the address from the IP.",
    "Wrong sign-up and password reset codes for the address."
  ]);

  // The e-mail alone lifts the lockout from every other IP too.
  await ip.fill("");
  await clear.click();
  await expect(notice).toContainText("Cleared for Anna@example.com:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Failed log-ins to the address from the IP."
  ]);

  await clear.click();
  await expect(
    page.getByText("Nothing was counting for Anna@example.com, so there was nothing to clear.")
  ).toBeVisible();
  await expect(notice).toHaveCount(0);
});

test("the superuser clears an account's own limits and daily caps with its e-mail, not with an IP", async ({
  page,
  api
}) => {
  api.loggedInAs("vb2007@example.com", "vb2007", { superuser: true });
  const arrange = (email: string) => {
    api.countsRateLimit("registrationCodeFailures", { email });
    api.countsRateLimit("emailChangeCodeFailures", { email });
    api.countsRateLimit("passwordResetCodeFailures", { email });
    api.countsRateLimit("passwordChecksPerAccount", { email });
    api.countsRateLimit("accountCodeChecksPerAccount", { email });
  };
  arrange("anna@example.com");
  api.countsRateLimit("passwordResetCodeFailures", { email: "milo@example.com" });
  api.countsRateLimit("passwordChecksPerIp", { ip: "203.0.113.7" });
  api.countsRateLimit("accountCodeChecksPerIp", { ip: "203.0.113.7" });

  await page.goto("/admin/system");
  const email = page.getByLabel("E-mail", { exact: true });
  const ip = page.getByLabel("IP address");
  const clear = page.getByRole("button", { name: "Clear rate limits" });
  const notice = page.locator(".status--success");

  // An IP can't narrow them: it clears only what is keyed by the IP.
  await ip.fill("203.0.113.7");
  await clear.click();
  await expect(notice).toContainText("Cleared for 203.0.113.7:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Wrong e-mail change codes from the IP.",
    "Wrong passwords on the account page from the IP."
  ]);

  // With both, each limiter keyed by the IP or the e-mail goes, in the API's order.
  api.countsRateLimit("passwordChecksPerIp", { ip: "203.0.113.7" });
  api.countsRateLimit("accountCodeChecksPerIp", { ip: "203.0.113.7" });
  await email.fill("Anna@example.com");
  await clear.click();
  await expect(notice).toContainText("Cleared for Anna@example.com and 203.0.113.7:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Wrong e-mail change codes from the IP.",
    "Wrong e-mail change codes for the account, 10 in 15 min.",
    "Wrong passwords on the account page from the IP.",
    "Wrong passwords on the account page, per account.",
    "Wrong password reset codes for the account, 20 a day.",
    "Wrong e-mail change codes for the account, 20 a day.",
    "Wrong sign-up codes for the waiting registration, 20 a day."
  ]);

  // The e-mail alone does the same for an account whose caps are all counting, and spares other addresses.
  arrange("anna@example.com");
  await ip.fill("");
  await clear.click();
  await expect(notice).toContainText("Cleared for Anna@example.com:");
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Wrong e-mail change codes for the account, 10 in 15 min.",
    "Wrong passwords on the account page, per account.",
    "Wrong password reset codes for the account, 20 a day.",
    "Wrong e-mail change codes for the account, 20 a day.",
    "Wrong sign-up codes for the waiting registration, 20 a day."
  ]);

  await email.fill("milo@example.com");
  await clear.click();
  await expect(notice.locator(".cleared__item")).toHaveText([
    "Wrong password reset codes for the account, 20 a day."
  ]);
});
