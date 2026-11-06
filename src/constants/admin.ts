import type { Stop } from "./stops";

/** The admin area's pages: the overview, where every section has its key, and the sections. */
export const AdminPaths = {
  overview: "/admin",
  users: "/admin/users",
  shortLinks: "/admin/short-links"
} as const;

/**
 * The names of the admin routes, for links that need params or history state (a page under a
 * section, such as one user's uploads) and for telling the overview apart from the rest.
 */
export const AdminRoutes = {
  overview: "admin",
  users: "admin-users",
  /** One account's page (`/admin/users/:id`), opened from its row; not a section of its own. */
  user: "admin-user",
  userUploads: "admin-user-uploads",
  shortLinks: "admin-short-links"
} as const;

/**
 * The admin area's sections, in the order the overview lists them. A section exists once its
 * route does, so each is open and draws as an open row of the Tools Directory.
 * Add a section by appending it here, with its path in `AdminPaths` and its route as a child of
 * `/admin` in the router; the overview follows.
 */
export const ADMIN_SECTIONS: Stop[] = [
  {
    id: "users",
    label: "Users",
    to: AdminPaths.users,
    status: "open",
    blurb: "Every account, its upload storage and its quota."
  },
  {
    id: "short-links",
    label: "Short links",
    to: AdminPaths.shortLinks,
    status: "open",
    blurb: "Every short link on the site, where it leads and who made it, to check or delete."
  }
];
