import { useRoute, useRouter } from "vue-router";

/**
 * Reads a one-off `?<name>=` the API left in the URL after a redirect, then drops it from the
 * address bar so a refresh doesn't repeat it. Empty when it isn't there.
 */
export const useQueryNotice = (name: string) => {
  const route = useRoute();
  const router = useRouter();
  const value = route.query[name];

  if (typeof value !== "string" || !value) {
    return "";
  }

  const query = { ...route.query };
  delete query[name];
  router.replace({ query, hash: route.hash });
  return value;
};
