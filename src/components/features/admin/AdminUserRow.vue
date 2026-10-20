<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  QUOTA_UNITS,
  quotaBytesFrom,
  quotaParts,
  type AdminUser,
  type QuotaUnit
} from "@/scripts/admin/adminUser";
import { formatDate } from "@/scripts/utility/dateUtil";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = defineProps<{
  user: AdminUser;
  saving: boolean;
  error: string;
  setQuota: (id: string, quotaBytes: number | null) => Promise<boolean>;
}>();

const detailsId = useId();
const expanded = ref(false);

const usage = computed(() => props.user.uploads);
/** Nothing more fits once used reaches the quota, including a quota of 0. */
const isFull = computed(() => usage.value.usedBytes >= usage.value.quotaBytes);
const share = computed(() =>
  usage.value.quotaBytes ? Math.min(1, usage.value.usedBytes / usage.value.quotaBytes) : 1
);

const UNIT_OPTIONS = (Object.keys(QUOTA_UNITS) as QuotaUnit[]).map((unit) => ({
  value: unit,
  label: unit
}));

/* The editor starts from the current quota and follows it after each save. */
const amount = ref("");
const unit = ref<QuotaUnit>("GB");
const amountError = ref("");
const saved = ref("");
const resetDraft = () => {
  ({ amount: amount.value, unit: unit.value } = quotaParts(usage.value.quotaBytes));
  amountError.value = "";
};
watch(() => usage.value.quotaBytes, resetDraft, { immediate: true });

const draft = computed(() => quotaBytesFrom(amount.value, unit.value));
const isUnchanged = computed(() => draft.value.bytes === usage.value.quotaBytes);
/** Read out with the field, so it's announced as well as shown. */
const belowUsageHint = computed(() =>
  draft.value.bytes !== null && draft.value.bytes < usage.value.usedBytes
    ? `That's less than ${props.user.username} uses now. Nothing gets deleted, but their uploads stop until they free up space.`
    : undefined
);

const save = async () => {
  saved.value = "";
  amountError.value = draft.value.error;
  if (draft.value.bytes === null || isUnchanged.value) return;
  if (await props.setQuota(props.user.id, draft.value.bytes)) {
    saved.value = `Quota set to ${formatBytes(usage.value.quotaBytes)}.`;
  }
};

const useDefault = async () => {
  saved.value = "";
  if (await props.setQuota(props.user.id, null)) {
    saved.value = `Back on the default quota, ${formatBytes(usage.value.quotaBytes)}.`;
  }
};
</script>

<template>
  <li class="row" :class="{ 'row--open': expanded }">
    <div class="row__summary">
      <div class="row__who">
        <button
          class="row__name"
          type="button"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          @click="expanded = !expanded"
        >
          <span class="row__name-text">{{ user.username }}</span>
          <AppIcon class="row__chevron" name="chevron" :size="18" />
        </button>
        <p class="row__meta">
          {{ usage.count }} {{ usage.count === 1 ? "file" : "files" }} · joined
          <time :datetime="user.createdAt">{{ formatDate(user.createdAt) }}</time>
        </p>
      </div>

      <p class="row__tags">
        <span v-if="user.isSuperuser" class="tag tag--admin">Admin</span>
        <span v-if="usage.hasCustomQuota" class="tag tag--custom">Custom quota</span>
      </p>

      <div class="measure" :class="{ 'measure--full': isFull }">
        <p class="measure__figure">
          <span class="measure__used">{{ formatBytes(usage.usedBytes) }}</span>
          of {{ formatBytes(usage.quotaBytes) }}
        </p>
        <span
          class="measure__line"
          role="meter"
          :aria-label="`Storage used by ${user.username}`"
          aria-valuemin="0"
          :aria-valuemax="usage.quotaBytes"
          :aria-valuenow="Math.min(usage.usedBytes, usage.quotaBytes)"
          :aria-valuetext="`${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)}`"
          :style="{ '--share': share }"
          :class="{ 'measure__line--some': usage.usedBytes > 0 }"
        >
          <span class="measure__run" />
          <span class="measure__stop" />
        </span>
      </div>
    </div>

    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>

    <div v-if="expanded" :id="detailsId" class="details">
      <dl class="facts">
        <div class="facts__row">
          <dt>E-mail</dt>
          <dd>{{ user.email }}</dd>
        </div>
        <div class="facts__row">
          <dt>Used</dt>
          <dd>
            {{ formatBytes(usage.usedBytes) }}
            <span class="facts__soft">({{ usage.usedBytes.toLocaleString() }} bytes)</span>
          </dd>
        </div>
        <div class="facts__row">
          <dt>Quota</dt>
          <dd>
            {{ formatBytes(usage.quotaBytes) }}
            <span class="facts__soft">{{
              usage.hasCustomQuota ? "(custom)" : "(the default)"
            }}</span>
          </dd>
        </div>
        <div v-if="usage.usedBytes > usage.quotaBytes" class="facts__row facts__row--over">
          <dt>Over by</dt>
          <dd>{{ formatBytes(usage.usedBytes - usage.quotaBytes) }}</dd>
        </div>
      </dl>

      <form class="quota" novalidate @submit.prevent="save">
        <div class="quota__fields">
          <BaseInput
            v-model="amount"
            class="quota__amount"
            label="New quota"
            inputmode="decimal"
            :hint="belowUsageHint"
            :error="amountError"
            @update:model-value="saved = ''"
          />
          <BaseSelect v-model="unit" label="Unit" :options="UNIT_OPTIONS" />
        </div>
        <div class="quota__actions">
          <BaseButton type="submit" size="sm" :loading="saving" :disabled="isUnchanged">
            {{ saving ? "Saving" : "Save quota" }}
          </BaseButton>
          <BaseButton
            size="sm"
            variant="secondary"
            :disabled="!usage.hasCustomQuota || saving"
            @click="useDefault"
          >
            Use default
          </BaseButton>
        </div>
      </form>

      <StatusMessage v-if="saved" tone="success">{{ saved }}</StatusMessage>
    </div>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.row__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "who tags"
    "measure measure";
  align-items: center;
  gap: var(--sp-3);
}

.row__who {
  grid-area: who;
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.row__name {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-ink);
  font-weight: 600;
  font-size: var(--fs-base);
  text-align: left;
  cursor: pointer;
}

.row__name-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
  transition: text-decoration-color var(--dur-quick) ease;
}

.row__name:hover .row__name-text {
  text-decoration-color: var(--c-line);
}

.row__name:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

.row__chevron {
  flex: none;
  color: var(--c-ink-soft);
  transition: transform var(--dur-base) var(--ease-out);
}

.row--open .row__chevron {
  transform: rotate(180deg);
}

.row__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.row__tags {
  grid-area: tags;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--sp-2);
}

/* Same pill as the upload badges; Admin in forest, a custom quota on sunk enamel. */
.tag {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem var(--sp-2);
  border: var(--edge) solid currentColor;
  border-radius: 999px;
  font-family: var(--font-board);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
}

.tag--admin {
  background: var(--c-ok-wash);
  color: var(--c-action);
}

.tag--custom {
  background: var(--c-panel-sunk);
  color: var(--c-ink-soft);
}

/* Used of quota as a stretch of line: the run ends in a ring where the user is, the rail ends at the quota. */
.measure {
  grid-area: measure;
  display: grid;
  gap: var(--sp-2);
}

.measure__figure {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.measure__used {
  color: var(--c-ink);
  font-weight: 700;
}

.measure__line {
  position: relative;
  display: block;
  height: 3px;
  margin: 0 0.4375rem;
  background: var(--c-hairline);
}

.measure__run {
  position: absolute;
  inset: 0 auto 0 0;
  /* Short of the terminus, so a nearly full run doesn't swallow it. */
  width: min(calc(var(--share) * 100%), calc(100% - 0.875rem));
  background: var(--c-line);
}

/* True to scale, except that any use at all shows a few pixels of green. */
.measure__line--some .measure__run {
  width: min(max(0.25rem, calc(var(--share) * 100%)), calc(100% - 0.875rem));
}

/* Full: the run reaches the terminus, which turns red. */
.measure--full .measure__run {
  width: 100%;
}

.measure__run::after,
.measure__stop {
  content: "";
  position: absolute;
  top: 50%;
  width: 0.625rem;
  height: 0.625rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
  transform: translate(50%, -50%);
}

.measure__run::after {
  right: 0;
}

/* The terminus at the quota. */
.measure__stop {
  right: 0;
  width: 0.875rem;
  height: 0.875rem;
  border-color: var(--c-ink-soft);
}

.measure--full .measure__run,
.measure--full .measure__run::after {
  background: var(--c-danger);
  border-color: var(--c-danger);
}

.measure--full .measure__stop {
  border-color: var(--c-danger);
  background: var(--c-danger);
}

@container (min-width: 40rem) {
  .row__summary {
    grid-template-columns: minmax(0, 1fr) auto minmax(12rem, 18rem);
    grid-template-areas: "who tags measure";
    gap: var(--sp-5);
  }
}

/* The row's own details, opened in place under it (never driven from hover). */
.details {
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.facts {
  display: grid;
  gap: var(--sp-2);
  margin: 0;
}

.facts__row {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr);
  gap: var(--sp-3);
  font-size: var(--fs-sm);
}

.facts dt {
  font-weight: 600;
  color: var(--c-ink-soft);
}

.facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.facts__soft {
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.facts__row--over dd {
  font-weight: 600;
}

.quota {
  display: grid;
  align-content: start;
  gap: var(--sp-3);
}

.quota__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(5.5rem, 7rem);
  align-items: start;
  gap: var(--sp-3);
}

.quota__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

@container (min-width: 40rem) {
  .details {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }

  .details > :last-child:not(.quota) {
    grid-column: 1 / -1;
  }
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
