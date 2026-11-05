<script setup lang="ts">
import { useTemplateRef, watch } from "vue";
import { isLoggedIn, isSessionChecked } from "@/scripts/authentication/authState";
import { useFormValidation } from "@/composables/useFormValidation";
import { useShortener, validateShortUrl } from "@/composables/useShortener";
import { Limits } from "@/constants/limits";
import { displayLink } from "@/scripts/utility/text";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import TicketSlip from "@/components/ui/TicketSlip.vue";

withDefaults(defineProps<{ as?: "h1" | "h2" }>(), { as: "h2" });

const { originalUrl, shortenedCode, shortenedLink, isLoading, errorMessage, shorten, reset } =
  useShortener();

const form = useTemplateRef("form");
const {
  errors,
  isValid,
  leave,
  validate,
  reset: resetChecks
} = useFormValidation({
  url: {
    value: originalUrl,
    check: () => validateShortUrl(originalUrl.value),
    // A pasted URL over the limit can't be fixed by typing on, so that shows straight away.
    early: () =>
      originalUrl.value.length > Limits.ShortUrl.maxLength
        ? validateShortUrl(originalUrl.value)
        : ""
  }
});

const submit = async () => {
  if (await validate(form.value)) await shorten();
};

// The shortened URL is gone from the field; that's not a problem to show.
watch(shortenedCode, (code) => {
  if (code) resetChecks();
});
</script>

<template>
  <StationBoard title="Shorten" :as="as">
    <form v-if="isLoggedIn" ref="form" class="form" novalidate @submit.prevent="submit">
      <BaseInput
        v-model="originalUrl"
        label="URL"
        type="text"
        placeholder="https://fos.hu/"
        autocomplete="off"
        mono
        required
        :error="errors.url || errorMessage"
        @blur="leave('url')"
      />
      <BaseButton type="submit" block :loading="isLoading" :blocked="!isValid">
        {{ isLoading ? "Shortening" : "Shorten" }}
      </BaseButton>
    </form>

    <div v-else-if="isSessionChecked" class="gate">
      <StatusMessage tone="info">
        Sorry, currently only logged-in users can shorten links. This will change in the future.
      </StatusMessage>
      <div class="gate__actions">
        <BaseButton to="/register">Create a new account</BaseButton>
        <BaseButton to="/login" variant="secondary">Log in</BaseButton>
      </div>
    </div>

    <TicketSlip
      v-if="shortenedCode"
      :value="shortenedLink()"
      :display="displayLink(shortenedLink())"
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
