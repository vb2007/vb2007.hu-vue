<script setup lang="ts">
import { computed, useTemplateRef, watch } from "vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { PASTE_LANGUAGES, languageLabel } from "@/scripts/pastebin/languages";
import { Limits } from "@/constants/limits";
import { pasteLink, validatePaste } from "@/scripts/pastebin/paste";
import type { Paste } from "@/types/api/pastebin";
import { displayLink } from "@/scripts/utility/text";
import { useFormValidation } from "@/composables/useFormValidation";
import { AUTO_LANGUAGE, useNewPaste } from "@/composables/useNewPaste";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseSelect from "@/components/ui/BaseSelect.vue";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });
const emit = defineEmits<{ created: [paste: Paste] }>();

const { content, language, detected, createdPaste, isLoading, errorMessage, create, reset } =
  useNewPaste();

/** "Auto: Python" follows the detection; any other pick sticks until the paste is created. */
const languageOptions = computed(() => [
  {
    value: AUTO_LANGUAGE,
    label: content.value.trim() ? `Auto: ${languageLabel(detected.value)}` : "Auto"
  },
  ...PASTE_LANGUAGES.map(({ id, label }) => ({ value: id, label }))
]);

const form = useTemplateRef("form");
const {
  errors,
  isValid,
  leave,
  validate,
  reset: resetChecks
} = useFormValidation({
  content: {
    value: content,
    check: () => validatePaste(content.value),
    early: () => (content.value.length > Limits.Paste.maxLength ? validatePaste(content.value) : "")
  }
});

const submit = async () => {
  if (await validate(form.value)) await create();
};

watch(createdPaste, (paste) => {
  if (paste) {
    // The sent text is gone from the field; that's not a problem to show.
    resetChecks();
    emit("created", paste);
  }
});
</script>

<template>
  <StationBoard title="Paste" :as="as">
    <form v-if="isLoggedIn" ref="form" class="form" novalidate @submit.prevent="submit">
      <BaseTextarea
        v-model="content"
        label="Text"
        placeholder="Paste text or code here"
        hint="Anyone with the link can read a paste."
        mono
        required
        :max-count="Limits.Paste.maxLength"
        :error="errors.content || errorMessage"
        @blur="leave('content')"
      />
      <BaseSelect v-model="language" label="Language" :options="languageOptions" />
      <BaseButton type="submit" block :loading="isLoading" :blocked="!isValid">
        {{ isLoading ? "Creating" : "Create paste" }}
      </BaseButton>
    </form>

    <div v-else-if="isSessionChecked" class="gate">
      <StatusMessage tone="info">
        Only logged-in users can create pastes. Anyone with a paste's link can read it.
      </StatusMessage>
      <div class="gate__actions">
        <BaseButton to="/register">Create a new account</BaseButton>
        <BaseButton to="/login" variant="secondary">Log in</BaseButton>
      </div>
    </div>

    <TicketSlip
      v-if="createdPaste"
      :value="pasteLink(createdPaste._id)"
      :display="displayLink(pasteLink(createdPaste._id))"
      caption="Your paste link"
      again-label="Paste another"
      @again="reset"
    />
  </StationBoard>
</template>

<style scoped>
.form,
.gate {
  display: grid;
  gap: var(--sp-4);
}

.gate__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-3);
}

.gate__actions > * {
  flex: 1 1 11rem;
}
</style>
