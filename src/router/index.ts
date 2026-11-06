import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import HomeView from "../views/HomeView.vue";

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "home",
    component: HomeView
  },
  {
    path: "/shorten",
    name: "shorten",
    component: () => import("../views/ShortenView.vue")
  },
  {
    path: "/pastebin",
    name: "pastebin",
    component: () => import("../views/PastebinView.vue")
  },
  {
    path: "/pastebin/:id",
    name: "paste",
    component: () => import("../views/PasteView.vue"),
    props: true
  },
  {
    path: "/upload",
    name: "upload",
    component: () => import("../views/UploadView.vue")
  },
  // The admin area: the gate stands in front of every child, and the overview lists the sections
  // in `ADMIN_SECTIONS` (`src/constants/admin.ts`). A new section is one more child here.
  {
    path: "/admin",
    component: () => import("../views/AdminAreaView.vue"),
    children: [
      {
        path: "",
        name: "admin",
        component: () => import("../views/AdminView.vue")
      },
      {
        path: "users",
        name: "admin-users",
        component: () => import("../views/AdminUsersView.vue")
      },
      {
        path: "users/:id/uploads",
        name: "admin-user-uploads",
        component: () => import("../views/AdminUserUploadsView.vue"),
        props: true
      }
    ]
  },
  {
    path: "/r/:code",
    name: "redirect",
    component: () => import("../views/RedirectView.vue"),
    props: true
  },
  {
    path: "/r/:code/preview",
    name: "redirect-preview",
    component: () => import("../views/RedirectView.vue"),
    props: (route) => ({ code: route.params.code, preview: true })
  },
  {
    path: "/account",
    name: "account",
    component: () => import("../views/AccountView.vue")
  },
  {
    path: "/login",
    name: "login",
    component: () => import("../views/LoginView.vue")
  },
  {
    path: "/register",
    name: "register",
    component: () => import("../views/RegisterView.vue")
  },
  {
    path: "/reset-password",
    name: "reset-password",
    component: () => import("../views/PasswordResetView.vue")
  },
  // The API redirects a browser that opens a route it doesn't have here, with `?url=` the path it
  // asked for (vb2007/vb2007.hu-api#305).
  {
    path: "/apierror",
    name: "api-error",
    component: () => import("../views/ApiErrorView.vue")
  },
  // Any path no route above matches gets the not-found board (a catch-all ranks below them all).
  {
    path: "/:pathMatch(.*)*",
    name: "not-found",
    component: () => import("../views/NotFoundView.vue")
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;
