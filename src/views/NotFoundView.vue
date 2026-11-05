<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";
import NotFoundPage from "@/components/features/not-found/NotFoundPage.vue";

const route = useRoute();

// The catch-all's segments, which the router has already decoded (`route.path` stays
// percent-encoded, so /árvíz would read as /%C3%A1rv%C3%ADz). A malformed escape stays as typed,
// and an empty last segment keeps a trailing slash.
const path = computed(() => "/" + [route.params.pathMatch].flat().join("/"));
</script>

<template>
  <NotFoundPage title="Page not found">
    <p>
      There's no page at <code class="path">{{ path }}</code
      >. The link may be old or mistyped.
    </p>
  </NotFoundPage>
</template>
