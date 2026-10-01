import "./styles/base.css";

import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";

import "./scripts/utility/themeState";

const app = createApp(App);

app.use(router);

app.mount("#app");
