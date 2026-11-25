import { createRouter, createWebHistory, parseQuery, type RouteRecordRaw } from "vue-router";
import { ADMIN_SECTIONS, AdminPaths, AdminRoutes, type AdminSectionId } from "@/constants/admin";
import { ApiKeyLinkQuery } from "@/constants/auth";
import { OauthQuery } from "@/constants/oauth";
import { pageTitle } from "@/constants/site";
import { TOOLS_LINE, type ToolId } from "@/constants/stops";
import { takeGithubReturn } from "@/scripts/authentication/githubReturn";
import { setNoindex } from "@/scripts/utility/robotsMeta";
import HomeView from "../views/HomeView.vue";

declare module "vue-router" {
  interface RouteMeta {
    /**
     * The page's own title, shown in the tab before the site's name ("Paste · vb2007.hu"). Home has
     * none, so its tab reads just the site's name. A child route merges its parent's meta, so each
     * admin page sets its own.
     */
    title?: string;
    /**
     * Keeps the page out of search results with a robots `noindex` meta, for the not-found pages
     * (the SPA answers every path with `200`), and the one-off MFA link. Leaving the page drops the
     * tag again.
     */
    noindex?: boolean;
  }
}

// A tool's or an admin section's page is titled with the label its stop already has, so the tab, the
// navbar and the overview read the same.
const toolLabel = (id: ToolId) => TOOLS_LINE.stops.find((stop) => stop.id === id)!.label;
const sectionLabel = (id: AdminSectionId) =>
  ADMIN_SECTIONS.find((section) => section.id === id)!.label;

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView
  },
  {
    path: "/shorten",
    name: "shorten",
    meta: { title: toolLabel("shorten") },
    component: () => import("../views/ShortenView.vue")
  },
  {
    path: "/pastebin",
    name: "pastebin",
    meta: { title: toolLabel("paste") },
    component: () => import("../views/PastebinView.vue")
  },
  {
    path: "/pastebin/:id",
    name: "paste",
    meta: { title: toolLabel("paste") },
    component: () => import("../views/PasteView.vue"),
    props: true
  },
  {
    path: "/upload",
    name: "upload",
    meta: { title: toolLabel("upload") },
    component: () => import("../views/UploadView.vue")
  },
  // The admin area: the gate stands in front of every child, and the overview lists the sections
  // in `ADMIN_SECTIONS` (`src/constants/admin.ts`, with `AdminPaths` and `AdminRoutes`). A new
  // section is one more child here, with its own `meta.title`.
  {
    path: AdminPaths.overview,
    component: () => import("../views/AdminAreaView.vue"),
    children: [
      {
        path: "",
        name: AdminRoutes.overview,
        meta: { title: "Admin" },
        component: () => import("../views/AdminView.vue")
      },
      {
        path: "users",
        name: AdminRoutes.users,
        meta: { title: sectionLabel("users") },
        component: () => import("../views/AdminUsersView.vue")
      },
      // One account, opened from its row in the Users section; it isn't a section of its own.
      {
        path: "users/:id",
        name: AdminRoutes.user,
        meta: { title: "User" },
        component: () => import("../views/AdminUserView.vue"),
        props: true
      },
      {
        path: "users/:id/uploads",
        name: AdminRoutes.userUploads,
        meta: { title: "User uploads" },
        component: () => import("../views/AdminUserUploadsView.vue"),
        props: true
      },
      {
        path: "pastes",
        name: AdminRoutes.pastes,
        meta: { title: sectionLabel("pastes") },
        component: () => import("../views/AdminPastesView.vue")
      },
      {
        path: "short-links",
        name: AdminRoutes.shortLinks,
        meta: { title: sectionLabel("short-links") },
        component: () => import("../views/AdminShortLinksView.vue")
      },
      {
        path: "uploads",
        name: AdminRoutes.uploads,
        meta: { title: sectionLabel("uploads") },
        component: () => import("../views/AdminUploadsView.vue")
      },
      {
        path: "system",
        name: AdminRoutes.system,
        meta: { title: sectionLabel("system") },
        component: () => import("../views/AdminSystemView.vue")
      }
    ]
  },
  {
    path: "/r/:code",
    name: "redirect",
    meta: { title: "Short link" },
    component: () => import("../views/RedirectView.vue"),
    props: true
  },
  {
    path: "/r/:code/preview",
    name: "redirect-preview",
    meta: { title: "Short link preview" },
    component: () => import("../views/RedirectView.vue"),
    props: (route) => ({ code: route.params.code, preview: true })
  },
  {
    path: "/account",
    name: "account",
    meta: { title: "Account" },
    component: () => import("../views/AccountView.vue"),
    // The GitHub relink always comes back here; one started from another page goes on to it, with
    // `?github=linked` or `?oauthError=`, and the query it had (an API key deep link's). Read on
    // every visit, so an abandoned one doesn't linger. The API key deep link goes on to its page.
    beforeEnter: (to) => {
      const back = takeGithubReturn();
      if (
        back.startsWith("/account/") &&
        (OauthQuery.github in to.query || OauthQuery.error in to.query)
      ) {
        const [path, search = ""] = back.split("?");
        return { path, query: { ...parseQuery(search), ...to.query }, replace: true };
      }
      return ApiKeyLinkQuery.open in to.query
        ? { name: "account-api-keys", query: to.query, replace: true }
        : true;
    }
  },
  // Kept off the account page, which is long already, and linked from its "API keys" row.
  {
    path: "/account/api-keys",
    name: "account-api-keys",
    meta: { title: "API keys" },
    component: () => import("../views/AccountApiKeysView.vue")
  },
  {
    path: "/login",
    name: "login",
    meta: { title: "Log in" },
    component: () => import("../views/LoginView.vue")
  },
  // The second step's mailed link, `/login/mfa#token=…` (vb2007/vb2007.hu-api#448): one-off, so
  // kept out of search results.
  {
    path: "/login/mfa",
    name: "login-mfa",
    meta: { title: "Log in", noindex: true },
    component: () => import("../views/LoginMfaView.vue")
  },
  {
    path: "/register",
    name: "register",
    meta: { title: "Register" },
    component: () => import("../views/RegisterView.vue")
  },
  {
    path: "/reset-password",
    name: "reset-password",
    meta: { title: "Reset password" },
    component: () => import("../views/PasswordResetView.vue")
  },
  // The API redirects a browser that opens a route it doesn't have here, with `?url=` the path it
  // asked for (vb2007/vb2007.hu-api#305).
  {
    path: "/apierror",
    name: "api-error",
    meta: { title: "API route not found", noindex: true },
    component: () => import("../views/ApiErrorView.vue")
  },
  // Any path no route above matches gets the not-found board (a catch-all ranks below them all).
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    meta: { title: "Page not found", noindex: true },
    component: () => import("../views/NotFoundView.vue")
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

// Each page's tab and history entry carry its own title (`meta.title`), and only the pages marked
// `meta.noindex` carry the robots tag. A navigation that failed (cancelled by a newer one, aborted or
// duplicated) leaves both alone, so a slow page overtaken by a faster one can't put its own title or
// tag over the page shown.
router.afterEach((to, _from, failure) => {
  if (failure) return;
  document.title = pageTitle(to.meta.title);
  setNoindex(to.meta.noindex === true);
});

export default router;
