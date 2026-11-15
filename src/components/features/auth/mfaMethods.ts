import type { Component } from "vue";
import MfaEmail from "@/components/features/auth/MfaEmail.vue";
import MfaPasskey from "@/components/features/auth/MfaPasskey.vue";
import MfaRecovery from "@/components/features/auth/MfaRecovery.vue";
import MfaTotp from "@/components/features/auth/MfaTotp.vue";
import { passkeysSupported } from "@/scripts/authentication/webauthn";
import type { MfaMethod } from "@/types/api/mfa";

/** One method of the login's second step, as `MfaStep` offers it. */
export interface MfaMethodEntry {
  method: MfaMethod;
  /** The step's heading while it's open. */
  title: string;
  /** The key under "Other ways" that switches to it. */
  switchLabel: string;
  /** Takes the step's shared `verifier` (`MfaVerifier`) as its only prop. */
  component: Component;
}

/**
 * The methods this site can do, in the order it prefers them: the first the API offers opens the
 * step. One the API offers that isn't here isn't offered yet.
 */
export const MFA_METHODS: MfaMethodEntry[] = [
  {
    method: "totp",
    title: "Authenticator app",
    switchLabel: "Use your authenticator app",
    component: MfaTotp
  },
  // Only where the browser can run the prompt: the API lists it next to another method anyway.
  ...(passkeysSupported()
    ? [
        {
          method: "passkey",
          title: "Passkey",
          switchLabel: "Use a passkey",
          component: MfaPasskey
        } satisfies MfaMethodEntry
      ]
    : []),
  { method: "email", title: "E-mail code", switchLabel: "Use an e-mail code", component: MfaEmail },
  {
    method: "recovery",
    title: "Recovery code",
    switchLabel: "Use a recovery code",
    component: MfaRecovery
  }
];
