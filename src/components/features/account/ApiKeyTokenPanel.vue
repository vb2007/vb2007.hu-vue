<script setup lang="ts">
/**
 * A created or rotated API key's token, shown once (vb2007/vb2007.hu-api#511): the API keeps only
 * its hash. Like the recovery codes, it stays until the user says they've saved it, and it lives
 * only here: never stored, put in a URL or logged.
 */
import { onMounted, useTemplateRef } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { useClipboard } from "@/composables/useClipboard";
import { apiUrl } from "@/scripts/api/client";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

defineProps<{
  /** The key's name, and the API's message about it. */
  name: string;
  message: string;
  token: string;
}>();
const emit = defineEmits<{ done: [] }>();

const { copied, failed, copy } = useClipboard();
const title = useTemplateRef("title");
/** How to use it, with a placeholder: the token itself shows once, above. */
const usage = `curl -H "Authorization: Bearer vbk_…" ${apiUrl(Endpoints.User.get)}`;
onMounted(() => title.value?.focus());
</script>

<template>
  <section class="token" aria-labelledby="token-title">
    <h2 id="token-title" ref="title" class="token__title" tabindex="-1">Your new API key</h2>
    <p class="token__note">
      <strong class="token__name">{{ name }}</strong>: {{ message }}
    </p>
    <p class="token__warning">
      <AppIcon name="alert" :size="18" />
      Copy it now: it won't be shown again.
    </p>
    <p class="token__value">
      <span class="visually-hidden">Token: </span><span class="token__text">{{ token }}</span>
    </p>
    <div class="token__actions">
      <BaseButton size="sm" variant="secondary" @click="copy(token)">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="16" />
        {{ copied ? "Copied" : "Copy token" }}
      </BaseButton>
      <BaseButton size="sm" @click="emit('done')">I've saved it</BaseButton>
    </div>
    <p class="token__note">Send it in the Authorization header, never in a URL:</p>
    <code class="token__usage">{{ usage }}</code>
    <p class="visually-hidden" role="status">
      {{ copied ? "Token copied." : failed ? "Couldn't copy: select the token instead." : "" }}
    </p>
  </section>
</template>

<style scoped>
/* The recovery codes' panel. */
.token {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.token__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.token__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.token__name {
  color: var(--c-ink);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.token__warning {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-weight: 600;
  color: var(--c-danger);
}

/* 47 characters that break anywhere on a phone; selectable whole. */
.token__value {
  padding: var(--sp-3) var(--sp-4);
  border: var(--edge) solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
  font-family: var(--font-code);
  font-weight: 500;
  overflow-wrap: anywhere;
}

.token__text {
  user-select: all;
}

.token__usage {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.token__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
