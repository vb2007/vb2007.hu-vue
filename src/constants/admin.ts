import type { Stop } from "./stops";

/** The admin area's pages: the overview, where every section has its key, and the sections. */
export const AdminPaths = {
  overview: "/admin",
  users: "/admin/users",
  system: "/admin/system"
} as const;

/**
 * The names of the admin routes, for links that need params or history state (a page under a
 * section, such as one user's uploads) and for telling the overview apart from the rest.
 */
export const AdminRoutes = {
  overview: "admin",
  users: "admin-users",
  userUploads: "admin-user-uploads",
  system: "admin-system"
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
    id: "system",
    label: "System",
    to: AdminPaths.system,
    status: "open",
    blurb: "Sign-ups waiting for their code, and clearing rate-limit lockouts."
  }
];
