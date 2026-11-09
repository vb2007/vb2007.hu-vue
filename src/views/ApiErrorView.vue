<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import { apiHost } from "@/scripts/api/client";
import { readableAddress } from "@/scripts/utility/text";
import NotFoundPage from "@/components/features/not-found/NotFoundPage.vue";

const route = useRoute();
const host = apiHost();

// The API sends a browser that opens a route it doesn't have here, with the path and query it was
// asked for as `?url=` (vb2007/vb2007.hu-api#305). Anyone can link here with any `url`, so it's only
// ever text, and only when it starts with `/` like every path the API sends: anything else, a
// missing, bare or repeated `url` included, gets the sentence without an address. What follows the
// `/` is still anyone's text, so readableAddress escapes the whitespace and invisible characters a
// real path never has unescaped, and a made-up sentence reads as an escaped address.
const address = computed(() => {
  const url = route.query.url;
  if (typeof url !== "string" || !url.startsWith("/")) return "";

  // Like the not-found page, escapes are decoded so accented letters read as typed. decodeURI keeps
  // the ones that would change the address's shape (%2F, %3F, %26…); one malformed escape leaves the
  // whole address undecoded.
  let decoded = url;
  try {
    decoded = decodeURI(url);
  } catch {
    // Shown undecoded.
  }
  return readableAddress(decoded);
});
</script>

<template>
  <NotFoundPage title="API route not found">
    <p v-if="address">
      The API has no route at
      <code class="path"
        ><span class="host">{{ host }}</span
        >{{ address }}</code
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
