<script setup lang="ts">
import { useClipboard } from "@/composables/useClipboard";
import AppIcon from "./AppIcon.vue";
import BaseButton from "./BaseButton.vue";

const props = defineProps<{ value: string }>();
const emit = defineEmits<{ again: [] }>();

const { copied, failed, copy } = useClipboard();
</script>

<template>
  <div class="slip">
    <p class="slip__caption">Your short link</p>
    <a class="slip__link" :href="value" target="_blank" rel="noopener">{{ value }}</a>
    <div class="slip__actions">
      <BaseButton size="sm" @click="copy(props.value)">
        <AppIcon :name="copied ? 'check' : 'copy'" :size="18" />
        {{ copied ? "Copied" : failed ? "Copy failed" : "Copy link" }}
      </BaseButton>
      <BaseButton size="sm" variant="ghost" @click="emit('again')">Shorten another</BaseButton>
    </div>
    <p class="visually-hidden" role="status">{{ copied ? "Link copied to clipboard" : "" }}</p>
  </div>
</template>

<style scoped>
.slip {
  --notch: 0.75rem;

  position: relative;
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-5);
  border: var(--edge) dashed var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-field);
  animation: print 720ms var(--ease-out) both;
}

/* Perforation notches on both sides, like a torn ticket */
.slip::before,
.slip::after {
  content: "";
  position: absolute;
  top: 50%;
  width: var(--notch);
  height: calc(var(--notch) * 2);
  background: var(--c-panel);
  border: var(--edge) solid var(--c-edge);
}

.slip::before {
  left: calc(var(--edge) * -1);
  transform: translateY(-50%);
  border-radius: 0 var(--notch) var(--notch) 0;
  border-left: 0;
}

.slip::after {
  right: calc(var(--edge) * -1);
  transform: translateY(-50%);
  border-radius: var(--notch) 0 0 var(--notch);
  border-right: 0;
}

.slip__caption {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.slip__link {
  font-family: var(--font-code);
  font-size: clamp(0.9rem, 0.8rem + 0.9vw, 1.0625rem);
  font-weight: 500;
  color: var(--c-ink);
  word-break: break-all;
  text-decoration-color: var(--c-line);
}

.slip__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-2);
}

@keyframes print {
  from {
    clip-path: inset(0 0 100% 0);
    transform: translateY(-1.25rem);
  }
  to {
    clip-path: inset(-1rem -1rem -1rem -1rem);
    transform: none;
  }
}
</style>
