<script setup lang="ts">
/**
 * The second step with an authenticator app (vb2007/vb2007.hu-api#447): its current code, nothing
 * to send first. A code works once, so one already used is refused like a wrong one.
 */
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import {
  confirmationCodeEarlyError,
  confirmationCodeError
} from "@/scripts/authentication/register";
import type { MfaVerifier } from "@/composables/useMfaVerify";
import MfaCodeForm from "@/components/features/auth/MfaCodeForm.vue";

defineProps<{ verifier: MfaVerifier }>();

const invalid = Messages.Mfa.totpCodeInvalid(Limits.Code.digits);
const hint = `${Messages.Mfa.totpHint(Limits.Code.digits, Limits.Mfa.totpPeriodSeconds)} ${Messages.Mfa.stepLimits(Limits.Mfa.challengeMinutes, Limits.Mfa.challengeAttempts)}`;
</script>

<template>
  <MfaCodeForm
    :verifier="verifier"
    method="totp"
    label="Code from your authenticator app"
    :hint="hint"
    :check="(code) => confirmationCodeError(code, invalid)"
    :early="(code) => confirmationCodeEarlyError(code, invalid)"
  />
</template>
