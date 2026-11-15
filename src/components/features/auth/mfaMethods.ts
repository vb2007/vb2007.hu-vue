import type { Component } from "vue";
import MfaEmail from "@/components/features/auth/MfaEmail.vue";
import MfaTotp from "@/components/features/auth/MfaTotp.vue";
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
  { method: "email", title: "E-mail code", switchLabel: "Use an e-mail code", component: MfaEmail }
];
