<script setup lang="ts">
/** Clears the API's rate-limit counters of an e-mail address, an IP or both, e.g. after a lockout. */
import { ref, useId, useTemplateRef } from "vue";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { ipError, rateLimitTargetError } from "@/scripts/admin/rateLimits";
import { useClearRateLimits } from "@/composables/useClearRateLimits";
import { useFormValidation } from "@/composables/useFormValidation";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const email = ref("");
const ip = ref("");
const noteId = useId();
const { isClearing, clearError, outcome, clear } = useClearRateLimits();

const form = useTemplateRef("form");
const { errors, isValid, leave, validate } = useFormValidation({
  email: { value: email, check: () => rateLimitTargetError(email.value, ip.value) },
  ip: { value: ip, check: () => ipError(ip.value) }
});

const onSubmit = async () => {
  if (!(await validate(form.value))) return;
  await clear(email.value, ip.value);
};
</script>

<template>
  <StationBoard title="Rate limits">
    <p :id="noteId" class="lead">
      Clears what the API counted against an address or an IP, such as failed log-ins. An address
      also lifts its log-in lockout from every IP, and clears its account's own limits and its daily
      wrong-code caps. Add an IP to lift the lockout from that IP only: the account's limits and
      caps are cleared either way, and an IP alone leaves them.
    </p>

    <form ref="form" class="form" novalidate @submit.prevent="onSubmit">
      <BaseInput
        v-model="email"
        label="E-mail"
        type="email"
        autocomplete="off"
        :maxlength="Limits.Email.maxLength"
        :error="errors.email"
        :describedby="noteId"
        @blur="leave('email')"
      />
      <BaseInput
        v-model="ip"
        label="IP address"
        hint="IPv4 or IPv6, e.g. 203.0.113.7. An IPv6 address clears its whole network block, as the API counts it."
        autocomplete="off"
        autocapitalize="off"
        mono
        :error="errors.ip"
        @blur="leave('ip')"
      />
      <StatusMessage v-if="clearError" tone="error">{{ clearError }}</StatusMessage>
      <BaseButton class="form__key" type="submit" :loading="isClearing" :blocked="!isValid">
        {{ isClearing ? "Clearing" : "Clear rate limits" }}
      </BaseButton>
    </form>

    <template v-if="outcome">
      <StatusMessage v-if="outcome.cleared.length" tone="success">
        {{ Messages.Admin.rateLimitsCleared(outcome.target) }}
        <span class="cleared">
          <!-- The hidden stops keep the names apart when read out in one go. -->
          <span v-for="name in outcome.cleared" :key="name" class="cleared__item"
            >{{ name }}<span class="visually-hidden">.</span></span
          >
        </span>
      </StatusMessage>
      <StatusMessage v-else tone="info">{{
        Messages.Admin.nothingCleared(outcome.target)
      }}</StatusMessage>
    </template>
  </StationBoard>
</template>

<style scoped>
.lead {
  color: var(--c-ink-soft);
}

.form {
  display: grid;
  gap: var(--sp-4);
}

.form__key {
  justify-self: start;
}

/* One limiter a line, inside the message's paragraph. */
.cleared {
  display: grid;
  gap: var(--sp-1);
  margin-top: var(--sp-2);
}

.cleared__item {
  display: block;
  padding-left: var(--sp-4);
  position: relative;
}

/* Each name is a stop on the line, like a Markdown bullet. */
.cleared__item::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0.55em;
  width: 0.5rem;
  height: 0.5rem;
  border: 2px solid var(--c-line);
  border-radius: 50%;
}
</style>
