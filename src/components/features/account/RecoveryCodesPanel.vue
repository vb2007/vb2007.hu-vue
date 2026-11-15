<script setup lang="ts">
/**
 * Fresh recovery codes, shown once (vb2007/vb2007.hu-api#448): the API keeps only their hashes.
 * The user copies or downloads them, and the panel stays until they say they've saved them. Any
 * answer that brings `recoveryCodes` shows here: the first method turned on, or new codes.
 */
import { onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import { username } from "@/scripts/authentication/authState";
import { useClipboard } from "@/composables/useClipboard";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";

const props = defineProps<{ codes: string[] }>();
const emit = defineEmits<{ done: [] }>();

const { copied, failed, copy } = useClipboard();
const title = useTemplateRef("title");
const fileName = "vb2007.hu-recovery-codes.txt";
const file = ref("");

const text = () =>
  [
    `vb2007.hu recovery codes for ${username.value}`,
    "",
    ...props.codes,
    "",
    "Each code logs in once, in place of the second step."
  ].join("\n");

// A download link to the codes as a text file, made again for new codes; the old one is freed.
watch(
  () => props.codes,
  () => {
    if (file.value) URL.revokeObjectURL(file.value);
    file.value = URL.createObjectURL(new Blob([text()], { type: "text/plain" }));
  },
  { immediate: true }
);
onBeforeUnmount(() => URL.revokeObjectURL(file.value));
onMounted(() => title.value?.focus());
</script>

<template>
  <section class="codes" aria-labelledby="codes-title">
    <h3 id="codes-title" ref="title" class="codes__title" tabindex="-1">Your recovery codes</h3>
    <p class="codes__note">
      If you can't do your second step, each code logs you in once instead. Save them somewhere
      safe, like a password manager: they're shown only now.
    </p>
    <ol class="codes__list" :aria-label="`${codes.length} recovery codes`">
      <li v-for="code in codes" :key="code" class="codes__code">{{ code }}</li>
    </ol>
    <div class="codes__actions">
      <BaseButton size="sm" variant="secondary" @click="copy(codes.join('\n'))">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="16" />
        {{ copied ? "Copied" : "Copy codes" }}
      </BaseButton>
      <BaseButton size="sm" variant="secondary" :href="file" :download="fileName">
        <AppIcon name="download" :size="16" />
        Download
      </BaseButton>
      <BaseButton size="sm" @click="emit('done')">I've saved them</BaseButton>
    </div>
    <p class="visually-hidden" role="status">
      {{ copied ? "Codes copied." : failed ? "Couldn't copy: select the codes instead." : "" }}
    </p>
  </section>
</template>

<style scoped>
.codes {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.codes__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.codes__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

/* Two columns where they fit (a code is 11 characters), one on a narrow phone or a large font. */
.codes__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 9rem), 1fr));
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
  padding: var(--sp-3) var(--sp-4);
  border: var(--edge) solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
  list-style: none;
}

.codes__code {
  font-family: var(--font-code);
  font-weight: 500;
  letter-spacing: 0.04em;
}

.codes__actions {
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
