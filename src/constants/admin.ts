import type { Stop } from "./stops";

/** The admin area's pages: the overview, where every section has its key, and the sections. */
export const AdminPaths = {
  overview: "/admin",
  users: "/admin/users"
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
  }
];
