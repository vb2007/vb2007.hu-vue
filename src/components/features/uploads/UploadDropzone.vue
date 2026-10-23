<script setup lang="ts">
import { ref, useTemplateRef } from "vue";
import type { UploadVisibility } from "@/scripts/uploads/upload";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import SegmentedControl, { type Segment } from "@/components/ui/SegmentedControl.vue";

defineProps<{ accept?: string; hint: string }>();
const emit = defineEmits<{ files: [files: File[], visibility: UploadVisibility] }>();

const visibility = ref<UploadVisibility>("private");
const VISIBILITY_OPTIONS: Segment<UploadVisibility>[] = [
  { value: "private", label: "Private", icon: "lock" },
  { value: "public", label: "Public", icon: "globe" }
];

const picker = useTemplateRef("picker");
const send = (files: FileList | null | undefined) => {
  if (files?.length) emit("files", [...files], visibility.value);
};

const onPicked = () => {
  send(picker.value!.files);
  // Clear it, so picking the same file again still fires `change`.
  picker.value!.value = "";
};

/** Children fire their own enter/leave, so count them to know when the drag really left. */
const depth = ref(0);
const onDragEnter = () => depth.value++;
const onDragLeave = () => (depth.value = Math.max(0, depth.value - 1));
const onDrop = (event: DragEvent) => {
  depth.value = 0;
  send(event.dataTransfer?.files);
};
</script>

<template>
  <div class="dropzone-wrap">
    <SegmentedControl v-model="visibility" legend="New uploads are" :options="VISIBILITY_OPTIONS" />
    <p class="visibility-hint">
      {{
        visibility === "private"
          ? "Only you can open private files, once you're logged in."
          : "Anyone with the link can open public files."
      }}
    </p>

    <div
      class="dropzone"
      :class="{ 'dropzone--over': depth > 0 }"
      data-testid="dropzone"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="dropzone__stop" aria-hidden="true"><AppIcon name="upload" :size="26" /></span>
      <p class="dropzone__title">{{ depth > 0 ? "Let go to upload" : "Drop files here" }}</p>
      <BaseButton variant="secondary" @click="picker!.click()">Choose files</BaseButton>
      <p class="dropzone__hint">{{ hint }}</p>
      <input
        ref="picker"
        class="visually-hidden"
        type="file"
        multiple
        :accept="accept"
        tabindex="-1"
        aria-label="Files to upload"
        @change="onPicked"
      />
    </div>
  </div>
</template>

<style scoped>
.dropzone-wrap {
  display: grid;
  gap: var(--sp-2);
}

.visibility-hint,
.dropzone__hint {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.dropzone {
  display: grid;
  justify-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
  padding: var(--sp-6) var(--sp-5);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  text-align: center;
  transition:
    background-color var(--dur-quick) ease,
    border-color var(--dur-quick) ease,
    box-shadow var(--dur-base) var(--ease-out);
}

/* The stop the file departs from: a route-green ring, filled while a drag is over it. */
.dropzone__stop {
  display: grid;
  place-items: center;
  width: 3.5rem;
  height: 3.5rem;
  border: 5px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
  color: var(--c-action);
  transition:
    transform var(--dur-base) var(--ease-out),
    background-color var(--dur-quick) ease,
    color var(--dur-quick) ease;
}

.dropzone__title {
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1.1;
  text-transform: uppercase;
}

.dropzone__hint {
  max-width: 34ch;
  text-wrap: balance;
}

.dropzone--over {
  border-color: var(--c-action);
  background: var(--c-panel);
  box-shadow: 0 0 0 4px color-mix(in oklch, var(--c-line) 45%, transparent);
}

.dropzone--over .dropzone__stop {
  transform: scale(1.12) translateY(-0.25rem);
  background: var(--c-action);
  border-color: var(--c-action);
  color: var(--c-on-action);
}
</style>
