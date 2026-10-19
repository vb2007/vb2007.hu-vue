<script setup lang="ts">
import { useTemplateRef, watch } from "vue";
import { isLoggedIn } from "@/scripts/authentication/authState";
import { useUploadUsage } from "@/composables/useUploadUsage";
import PageSection from "@/components/layout/PageSection.vue";
import UploadComposer from "@/components/features/uploads/UploadComposer.vue";
import UploadList from "@/components/features/uploads/UploadList.vue";
import UsageMeter from "@/components/features/uploads/UsageMeter.vue";

const list = useTemplateRef("list");
const { usage, errorMessage: usageError, load: loadUsage } = useUploadUsage();

// The session may be restored after this page opens, so wait for it before asking for usage.
watch(
  isLoggedIn,
  (loggedIn) => {
    if (loggedIn) loadUsage();
  },
  { immediate: true }
);

// The composer only uploads for logged-in users, so the list is there to refresh.
const onUploaded = () => {
  list.value!.refresh();
  loadUsage();
};
</script>

<template>
  <!-- Logged in it's a workspace (send files and storage on the left, your uploads on the right); otherwise just the gate. -->
  <PageSection :width="isLoggedIn ? 'wide' : 'narrow'">
    <div class="workspace" :class="{ 'workspace--split': isLoggedIn }">
      <div class="workspace__send">
        <UploadComposer as="h1" :usage="usage" @uploaded="onUploaded" />
        <UsageMeter v-if="isLoggedIn" :usage="usage" :error-message="usageError" />
      </div>
      <UploadList v-if="isLoggedIn" ref="list" @changed="loadUsage" />
    </div>
  </PageSection>
</template>

<style scoped>
.workspace,
.workspace__send {
  display: grid;
  gap: var(--sp-6);
}

@media (min-width: 62rem) {
  .workspace--split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr);
    align-items: start;
  }

  /* Keep the drop target in reach while scrolling a long list. */
  .workspace--split .workspace__send {
    position: sticky;
    top: calc(var(--nav-h) + var(--sp-5));
  }
}
</style>
