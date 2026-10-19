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
    path: "/login",
    name: "login",
    component: () => import("../views/LoginView.vue")
  },
  {
    path: "/register",
    name: "register",
    component: () => import("../views/RegisterView.vue")
  }
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
});

export default router;
