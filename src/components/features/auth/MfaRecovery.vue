<script setup lang="ts">
/**
 * The second step with a saved recovery code (vb2007/vb2007.hu-api#482): each works once. Only an
 * empty field is refused here; the API ignores case, spaces and dashes and checks the rest.
 */
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import type { MfaVerifier } from "@/composables/useMfaVerify";
import MfaCodeForm from "@/components/features/auth/MfaCodeForm.vue";

defineProps<{ verifier: MfaVerifier }>();

const hint = `One of the recovery codes you saved, like abcde-fghij. Each works once. ${Messages.Mfa.stepLimits(Limits.Mfa.challengeMinutes, Limits.Mfa.challengeAttempts)}`;
const check = (code: string) =>
  code.replace(/[\s-]/g, "") ? "" : Messages.Mfa.recoveryCodeMissing;
</script>

<template>
  <MfaCodeForm
    :verifier="verifier"
    method="recovery"
    label="Recovery code"
    :hint="hint"
    :check="check"
    :refused="Messages.Mfa.recoveryCodeRefused"
    text
  />
</template>
