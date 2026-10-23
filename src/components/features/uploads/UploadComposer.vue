<script setup lang="ts">
import { computed, toRef } from "vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { useUploadQueue } from "@/composables/useUploadQueue";
import { acceptFor, type Upload, type UploadUsage } from "@/scripts/uploads/upload";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import UploadDropzone from "./UploadDropzone.vue";
import UploadQueue from "./UploadQueue.vue";

const props = withDefaults(defineProps<{ usage: UploadUsage | null; as?: "h1" | "h2" }>(), {
  as: "h2"
});
const emit = defineEmits<{ uploaded: [upload: Upload] }>();

const { items, hasFinished, add, cancel, retry, dismiss, clearFinished } = useUploadQueue(
  toRef(props, "usage"),
  (upload) => emit("uploaded", upload)
);

const accept = computed(() => (props.usage ? acceptFor(props.usage.allowedTypes) : undefined));
const hint = computed(() =>
  props.usage
    ? `Up to ${formatBytes(props.usage.maxFileSizeBytes)} each. Images, video, audio, PDFs, text and archives.`
    : "Images, video, audio, PDFs, text and archives."
);
</script>

<template>
  <StationBoard title="Upload" :as="as">
    <template v-if="isLoggedIn">
      <UploadDropzone :accept="accept" :hint="hint" @files="add" />
      <UploadQueue
        :items="items"
        :has-finished="hasFinished"
        @cancel="cancel"
        @retry="retry"
        @dismiss="dismiss"
        @clear="clearFinished"
      />
    </template>

    <div v-else-if="isSessionChecked" class="gate">
      <StatusMessage tone="info">
        Only logged-in users can upload files. Public uploads open for anyone with the link, private
        ones only for you.
      </StatusMessage>
      <div class="gate__actions">
        <BaseButton to="/register">Create a new account</BaseButton>
        <BaseButton to="/login" variant="secondary">Log in</BaseButton>
      </div>
    </div>
  </StationBoard>
</template>

<style scoped>
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
