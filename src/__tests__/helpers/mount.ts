import { mount, type ComponentMountingOptions } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import type { Component } from "vue";
import { routes } from "@/router";

/** A fresh router with the app's real routes, backed by in-memory history so tests don't touch the URL. */
export const createTestRouter = () =>
  createRouter({
    history: createMemoryHistory(),
    routes
  });

/** Mounts a component with a test router installed, after navigating to `path`. */
export const mountWithRouter = async <T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> = {},
  path = "/"
) => {
  const router = createTestRouter();
  await router.push(path);
  await router.isReady();
  const wrapper = mount(component, {
    ...options,
    global: { ...options.global, plugins: [...(options.global?.plugins ?? []), router] }
  } as ComponentMountingOptions<T>);
  return { wrapper, router };
};
