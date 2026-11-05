<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { apiHost } from "@/scripts/api/client";
import NotFoundPage from "@/components/features/not-found/NotFoundPage.vue";

/** A longer address is cut here: the whole of it is still in the address bar. */
const MAX_SHOWN = 200;

const route = useRoute();
const host = apiHost();

// The API sends a browser that opens a route it doesn't have here, with the path and query it was
// asked for as `?url=` (vb2007/vb2007.hu-api#305). Anyone can link here with any `url`, so it's only
// ever shown as text, and only when it reads as a path on the API: anything else, a missing or
// repeated `url` included, gets the sentence without an address.
const address = computed(() => {
  const url = route.query.url;
  if (typeof url !== "string" || !url.startsWith("/")) return "";

  // Like the not-found page, escapes are decoded so accented letters read as typed. decodeURI keeps
  // the ones that would change the address's shape (%2F, %3F, %26…), and a malformed one stays as sent.
  let shown = url;
  try {
    shown = decodeURI(url);
  } catch {
    // Kept as sent.
  }

  const chars = [...shown];
  return chars.length > MAX_SHOWN ? chars.slice(0, MAX_SHOWN).join("") + "…" : shown;
});
</script>

<template>
  <NotFoundPage title="API route not found">
    <p v-if="address">
      The API has no route at
      <code class="path"><span class="host">{{ host }}</span>{{ address }}</code
      >. The link may be old or mistyped.
    </p>
    <p v-else>The API has no route at the address you opened. The link may be old or mistyped.</p>
  </NotFoundPage>
</template>

<style scoped>
/* The host is context; the path is what's missing. */
.host {
  color: var(--c-ink-soft);
  font-weight: 400;
}
</style>
