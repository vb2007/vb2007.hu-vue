<script setup lang="ts">
/**
 * The account page's API keys (vb2007/vb2007.hu-api#513), read-only: each key's name, the end of
 * its token, its scopes, and when it was made, expires and was last used. Revoking them is an
 * Actions row (`AdminRevokeApiKeys`).
 */
import { apiKeyDates } from "@/scripts/authentication/apiKeys";
import type { ApiKey } from "@/types/api/apiKeys";
import AppIcon from "@/components/ui/AppIcon.vue";

defineProps<{ keys: ApiKey[]; username: string }>();
</script>

<template>
  <ul v-if="keys.length" class="keys" :aria-label="`${username}'s API keys`">
    <li v-for="apiKey in keys" :key="apiKey.id" class="key">
      <span class="key__mark"><AppIcon name="key" :size="22" /></span>
      <div class="key__main">
        <h3 class="key__name">
          {{ apiKey.name }}
          <code class="key__hint"
            ><span class="visually-hidden">ending in </span><span aria-hidden="true">…</span
            >{{ apiKey.hint }}</code
          >
        </h3>
        <p class="key__scopes">{{ apiKey.scopes.join(", ") }}</p>
        <!-- The dots are hidden from screen readers, which hear commas instead, like a passkey's. -->
        <p class="key__dates">
          <template v-for="(fact, index) in apiKeyDates(apiKey)" :key="index"
            ><template v-if="index"
              ><span aria-hidden="true"> · </span><span class="visually-hidden">, </span></template
            ><strong v-if="fact.expired" class="key__expired">{{ fact.text }}</strong
            ><template v-else>{{ fact.text }}</template></template
          >
        </p>
      </div>
    </li>
  </ul>
  <p v-else class="none">{{ username }} has no API keys.</p>
</template>

<style scoped>
.keys {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
}

/* Like the Account board's passkey rows: the tile a size down from the Actions rows'. */
.key {
  display: flex;
  align-items: flex-start;
  gap: var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.key__mark {
  flex: none;
  display: grid;
  place-items: center;
  width: 2.75rem;
  height: 2.75rem;
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-sm);
  background: var(--c-panel-sunk);
  color: var(--c-action);
}

.key__main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--sp-1);
}

/* A name the user chose: kept as typed, not uppercased like the section's own names. */
.key__name {
  font-size: 1.0625rem;
  font-weight: 600;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.key__hint {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-soft);
  white-space: nowrap;
}

.key__scopes {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.key__dates,
.none {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* An expired key no longer works: said in ink, not in the warning red of a suspension. */
.key__expired {
  color: var(--c-ink);
  font-weight: 600;
}
</style>
