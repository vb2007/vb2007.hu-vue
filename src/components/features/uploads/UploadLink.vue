<script setup lang="ts">
import { computed } from "vue";
import { linkParts, withoutQuery } from "@/scripts/uploads/upload";

/**
 * A link on one line: the host and folders give way first, the file part always stays readable.
 * A private link's signature isn't shown, not even in the tooltip; copying keeps it.
 */
const props = defineProps<{ url: string }>();
const parts = computed(() => linkParts(props.url));
</script>

<template>
  <span class="link" :title="withoutQuery(url)">
    <span class="link__head">{{ parts.head }}</span>
    <span class="link__tail">{{ parts.tail }}</span>
  </span>
</template>

<style scoped>
.link {
  display: flex;
  flex-wrap: wrap;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  font-weight: 500;
  white-space: nowrap;
}

/* At least "cdn…" stays, so it still reads as a link. It grows from there up to its full length,
   so the file part goes to a second line only when even that doesn't fit beside it. */
.link__head {
  flex: 1 1 0;
  min-width: 4ch;
  max-width: max-content;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* The file part is never cut off: alone on a line too narrow for it, it wraps. */
.link__tail {
  flex: none;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
