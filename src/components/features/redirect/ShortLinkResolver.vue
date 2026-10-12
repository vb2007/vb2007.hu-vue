<script setup lang="ts">
import { computed, watch } from "vue";
import { useShortLink } from "@/composables/useShortLink";
import { formatDateTime } from "@/scripts/utility/dateUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = defineProps<{
  code: string;
  /** Stop at the destination instead of going there. */
  preview?: boolean;
  navigate?: (url: string) => void;
}>();

const { state, target, details, errorMessage, resolve } = useShortLink(props.navigate);

// Only read while previewing, when the target is a parsed, safe URL.
const host = computed(() => new URL(target.value).host);
const addedOn = computed(() =>
  details.value.addedOn ? formatDateTime(details.value.addedOn) : ""
);
const byline = computed(() => {
  const { addedBy } = details.value;
  if (!addedBy && !addedOn.value) return "";
  return ["Shared", addedBy && `by ${addedBy}`, addedOn.value && `on ${addedOn.value}`]
    .filter(Boolean)
    .join(" ");
});

watch(
  () => [props.code, props.preview] as const,
  ([code, preview]) => resolve(code, preview),
  { immediate: true }
);
</script>

<template>
  <StationBoard title="Short link" as="h1">
    <p v-if="state === 'resolving'" class="note">Looking up this link…</p>

    <template v-else-if="state === 'previewing'">
      <dl class="facts">
        <div class="fact">
          <dt>Leads to</dt>
          <dd>
            <span class="host">{{ host }}</span>
            <span class="target">{{ target }}</span>
          </dd>
        </div>
        <div v-if="details.addedBy" class="fact">
          <dt>Shared by</dt>
          <dd>{{ details.addedBy }}</dd>
        </div>
        <div v-if="addedOn" class="fact">
          <dt>Shared on</dt>
          <dd>
            <time :datetime="details.addedOn">{{ addedOn }}</time>
          </dd>
        </div>
      </dl>
      <div class="actions">
        <BaseButton :href="target">Continue to {{ host }}</BaseButton>
        <BaseButton to="/shorten" variant="secondary">Shorten a link</BaseButton>
      </div>
    </template>

    <template v-else-if="state === 'redirecting'">
      <p class="note">Taking you there…</p>
      <a class="target" :href="target" rel="noopener noreferrer">{{ target }}</a>
      <p v-if="byline" class="byline">{{ byline }}</p>
    </template>

    <template v-else>
      <StatusMessage v-if="state === 'unsafe'" tone="error">
        This short link points somewhere the site won't open.
      </StatusMessage>
      <StatusMessage v-else tone="error">{{ errorMessage }}</StatusMessage>
      <p v-if="state === 'unsafe' && byline" class="byline">{{ byline }}</p>
      <div class="actions">
        <BaseButton v-if="state === 'error'" @click="resolve(code, preview)">
          Try again
        </BaseButton>
        <BaseButton to="/shorten" variant="secondary">Shorten a link</BaseButton>
      </div>
    </template>
  </StationBoard>
</template>

<style scoped>
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

.target {
  font-family: var(--font-code);
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--c-ink);
  overflow-wrap: anywhere;
  text-decoration-color: var(--c-line);
}

.byline {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.facts {
  display: grid;
  gap: var(--sp-4);
}

.fact dt {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.fact dd {
  margin: var(--sp-1) 0 0;
  font-weight: 600;
}

.host {
  display: block;
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.host + .target {
  display: block;
  margin-top: var(--sp-1);
  color: var(--c-ink-soft);
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}
</style>
