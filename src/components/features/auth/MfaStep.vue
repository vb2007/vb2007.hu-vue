<script setup lang="ts">
/**
 * The login's second step (vb2007/vb2007.hu-api#448), on the Log in board in place of the password
 * form. It opens the first method in `MFA_METHODS` the API offers and lists the others under it,
 * each a key that switches to it. Every method is a component that takes the shared `verifier`.
 */
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { Messages } from "@/constants/messages";
import { CONTACT_MAILTO, MATRIX_URL } from "@/constants/site";
import { useMfaVerify } from "@/composables/useMfaVerify";
import { MFA_METHODS } from "@/components/features/auth/mfaMethods";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { MfaMethod } from "@/types/api/mfa";

const props = defineProps<{
  /** The API's `methods`, as the login or `GET /auth/mfa` answered them. */
  methods: MfaMethod[];
}>();
/** "Log in again": back to the password form, forgetting this step. */
const emit = defineEmits<{ back: [] }>();

const offered = computed(() => MFA_METHODS.filter((entry) => props.methods.includes(entry.method)));
const chosen = ref(offered.value[0]?.method);
const current = computed(() => offered.value.find((entry) => entry.method === chosen.value));
const others = computed(() => offered.value.filter((entry) => entry !== current.value));

const verifier = useMfaVerify();
const lead = useTemplateRef("lead");

/** Switches the method; the lead line takes the focus, so the new method reads from the top. */
const choose = (method: MfaMethod) => {
  chosen.value = method;
  verifier.refusal.value = "";
  lead.value?.focus();
};

onMounted(() => lead.value?.focus());
</script>

<template>
  <div class="mfa">
    <p ref="lead" class="mfa__lead" tabindex="-1">
      One more step: confirm it's you to finish logging in.
    </p>

    <template v-if="current">
      <h2 class="mfa__title">{{ current.title }}</h2>
      <component :is="current.component" :key="current.method" :verifier="verifier" />
    </template>
    <StatusMessage v-else tone="error">{{ Messages.Mfa.noMethod }}</StatusMessage>

    <div v-if="others.length" class="mfa__others">
      <h2 class="mfa__others-title">Other ways</h2>
      <ul class="mfa__list">
        <li v-for="entry in others" :key="entry.method">
          <BaseButton
            variant="secondary"
            size="sm"
            :disabled="verifier.isVerifying.value"
            @click="choose(entry.method)"
          >
            {{ entry.switchLabel }}
          </BaseButton>
        </li>
      </ul>
    </div>

    <p class="mfa__back">
      Wrong account?
      <button
        type="button"
        class="mfa__link"
        :disabled="verifier.isVerifying.value"
        @click="emit('back')"
      >
        Log in again
      </button>
    </p>
    <!-- For a user with no way through the step left: only the admin's MFA reset helps. -->
    <p class="mfa__help">
      Lost every way in? A password reset doesn't turn this step off: ask the site's admin to reset
      it, by <a :href="CONTACT_MAILTO">e-mail</a> or on
      <a :href="MATRIX_URL" target="_blank" rel="noopener"
        >Matrix<span class="visually-hidden"> (opens in a new tab)</span></a
      >.
    </p>
  </div>
</template>

<style scoped>
.mfa {
  display: grid;
  gap: var(--sp-4);
}

.mfa__lead {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.mfa__title,
.mfa__others-title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.mfa__others {
  display: grid;
  gap: var(--sp-3);
  padding-top: var(--sp-4);
  border-top: var(--edge) solid var(--c-hairline);
}

.mfa__list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.mfa__back,
.mfa__help {
  font-size: var(--fs-sm);
}

.mfa__help {
  color: var(--c-ink-soft);
}

/* A key drawn as a link, like Reset password's "Enter it". */
.mfa__link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-action);
  font: inherit;
  text-decoration: underline;
  text-decoration-thickness: 0.09em;
  text-underline-offset: 0.18em;
  cursor: pointer;
}

.mfa__link:hover:not(:disabled) {
  text-decoration-thickness: 0.16em;
}

.mfa__link:disabled {
  color: var(--c-ink-soft);
  cursor: not-allowed;
}
</style>
