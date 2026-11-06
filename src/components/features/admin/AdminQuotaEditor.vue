<script setup lang="ts">
/** Sets an account's upload quota, or puts it back on the default; says so once it's saved. */
import { computed, ref, useTemplateRef, watch } from "vue";
import { QUOTA_UNITS, quotaBytesFrom, quotaParts, type QuotaUnit } from "@/scripts/admin/adminUser";
import type { AdminUser } from "@/types/api/admin";
import { useFormValidation } from "@/composables/useFormValidation";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = defineProps<{
  user: AdminUser;
  saving: boolean;
  setQuota: (id: string, quotaBytes: number | null) => Promise<boolean>;
}>();

const usage = computed(() => props.user.uploads);

const UNIT_OPTIONS = (Object.keys(QUOTA_UNITS) as QuotaUnit[]).map((unit) => ({
  value: unit,
  label: unit
}));

/* The editor starts from the current quota and follows it after each save. */
const amount = ref("");
const unit = ref<QuotaUnit>("GB");
const saved = ref("");
const form = useTemplateRef("form");
const { errors, isValid, leave, validate, reset } = useFormValidation({
  amount: { value: amount, check: () => draft.value.error }
});
const resetDraft = () => {
  ({ amount: amount.value, unit: unit.value } = quotaParts(usage.value.quotaBytes));
  reset();
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
  if (!(await validate(form.value)) || isUnchanged.value) return;
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
  <div class="quota">
    <form ref="form" class="quota__form" novalidate @submit.prevent="save">
      <div class="quota__fields">
        <BaseInput
          v-model="amount"
          class="quota__amount"
          label="New quota"
          inputmode="decimal"
          :hint="belowUsageHint"
          :error="errors.amount"
          @update:model-value="saved = ''"
          @blur="leave('amount')"
        />
        <BaseSelect v-model="unit" label="Unit" :options="UNIT_OPTIONS" />
      </div>
      <div class="quota__actions">
        <BaseButton
          type="submit"
          size="sm"
          :loading="saving"
          :disabled="isUnchanged"
          :blocked="!isValid"
        >
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
</template>

<style scoped>
.quota,
.quota__form {
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
</style>
