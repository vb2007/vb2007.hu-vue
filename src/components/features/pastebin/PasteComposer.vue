<script setup lang="ts">
import { watch } from "vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { PASTE_MAX_LENGTH, pasteLink, type Paste } from "@/scripts/pastebin/paste";
import { useNewPaste } from "@/composables/useNewPaste";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseTextarea from "@/components/ui/BaseTextarea.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });
const emit = defineEmits<{ created: [paste: Paste] }>();

const { content, createdPaste, isLoading, errorMessage, create, reset } = useNewPaste();

watch(createdPaste, (paste) => {
  if (paste) emit("created", paste);
});
</script>

<template>
  <StationBoard title="Paste" :as="as">
    <form v-if="isLoggedIn" class="form" novalidate @submit.prevent="create">
      <BaseTextarea
        v-model="content"
        label="Text"
        placeholder="Paste text or code here"
        hint="Anyone with the link can read a paste."
        mono
        required
        :max-count="PASTE_MAX_LENGTH"
        :error="errorMessage"
      />
      <BaseButton type="submit" block :loading="isLoading">
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
