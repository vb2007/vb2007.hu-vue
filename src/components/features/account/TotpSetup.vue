<script setup lang="ts">
/**
 * A waiting authenticator app setup (vb2007/vb2007.hu-api#447): the QR code of its `otpauthUrl`,
 * the secret to type in instead, and the app's first code, which turns it on. The secret is only
 * in this component's props: closing it drops it, and the API never sends it again.
 *
 * The confirm's 400 tells a wrong code (with the setup's `attemptsLeft`) from a setup that's gone
 * (its `reason`, vb2007/vb2007.hu-api#494). Once it's gone, at the last try, or when its time runs
 * out here (or a 429's wait outlasts it), the panel says why and `expire` asks the parent to drop
 * the dead secret, which leaves `setup` null. The only way on is to start again. `noSetup` may also
 * mean a parallel confirm in another tab won, so the account is looked up again first.
 */
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  useTemplateRef,
  watch
} from "vue";
import { encode } from "uqr";
import { Endpoints } from "@/constants/endpoints";
import { ErrorReason, HttpStatus } from "@/constants/http";
import { Limits } from "@/constants/limits";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useClipboard } from "@/composables/useClipboard";
import { useFormValidation } from "@/composables/useFormValidation";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiRequest } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import {
  confirmationCodeEarlyError,
  confirmationCodeError
} from "@/scripts/authentication/register";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import BaseInput from "@/components/ui/BaseInput.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import { statusTextId } from "@/components/ui/statusMessage";
import type { MfaTurnOnResponse, TotpSetupResponse } from "@/types/api/mfa";

const props = defineProps<{
  /** Null once the setup ran out and its secret was dropped. */
  setup: TotpSetupResponse | null;
  /** TOTP is on already: the old app works until this one's code is confirmed. */
  moving: boolean;
}>();
const emit = defineEmits<{
  done: [data: MfaTurnOnResponse];
  cancel: [];
  /** A new setup, which needs the password again. */
  restart: [];
  /** The setup ran out: its secret is no use any more. */
  expire: [];
  /** Not moving, a confirm in another tab turned it on (and got any recovery codes). */
  turnedOnElsewhere: [];
}>();

/** The QR code as one path of dark modules, a run per row segment, with the 4-module quiet zone. */
const qr = computed(() => {
  const { data, size } = encode(props.setup!.otpauthUrl, { border: 4 });
  const path = data
    .flatMap((row, y) =>
      row.map((dark, x) =>
        dark && !row[x - 1] ? `M${x} ${y}h${row.indexOf(false, x) - x}v1H${x}z` : ""
      )
    )
    .join("");
  return { path, size };
});
const groupedSecret = computed(() => props.setup!.secret.match(/.{1,4}/g)!.join(" "));

const invalid = Messages.Mfa.totpCodeInvalid(Limits.Code.digits);
const setupHint = Messages.Mfa.totpSetupHint(
  Limits.Code.digits,
  Limits.Mfa.totpSetupMinutes,
  Limits.Mfa.totpSetupAttempts
);
const ranOutOfTime = Messages.Mfa.totpSetupRanOut(Limits.Mfa.totpSetupMinutes);
/** The API's minutes started at its answer, a moment before this opened: end a little early. */
const EARLY_MS = 30_000;
const deadline = Date.now() + Limits.Mfa.totpSetupMinutes * 60_000 - EARLY_MS;

const code = ref("");
const isConfirming = ref(false);
/** The 400: a wrong code, the field's own error. */
const refusal = ref("");
/** Anything else: the per-account limit on codes, the network. */
const error = ref("");
/** Whether a code was refused, which offers to start again. */
const refused = ref(false);
/** The setup's tries left after the last refusal, from the API. */
const left = ref<number>();
/** The last try is the hint's, so it stays while the next code is typed, which clears the refusal. */
const hint = computed(() =>
  left.value === 1 ? Messages.Mfa.totpSetupLastTry(Limits.Code.digits) : setupHint
);
/** Why the setup ended, once it has. */
const ending = ref("");
const ranOut = computed(() => !props.setup);
const hold = useRetryHold(error);
const isHeld = computed(() => hold.isHeld());
const shownError = computed(() => hold.shown());
const { copied, failed, copy } = useClipboard();
const titleId = useId();
const errorId = useId();
const panel = useTemplateRef("panel");
const title = useTemplateRef("title");
const form = useTemplateRef("form");
const ranOutMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("ranOutMessage");

const { errors, isValid, leave, validate } = useFormValidation({
  code: {
    value: code,
    check: () => confirmationCodeError(code.value, invalid),
    early: () => confirmationCodeEarlyError(code.value, invalid)
  }
});
watch(code, () => (refusal.value = ""));

const focusField = () => form.value?.querySelector("input")?.focus();

const confirm = async () => {
  if (isHeld.value || isConfirming.value || !(await validate(form.value))) return;
  isConfirming.value = true;
  error.value = "";
  const result = await apiRequest(Endpoints.User.mfaTotpConfirm, {
    body: { code: code.value.replace(/\s/g, "") },
    failure: Messages.Mfa.verifyFailed,
    quietStatuses: [HttpStatus.BadRequest]
  });
  const body = result.ok || result.status !== HttpStatus.BadRequest ? null : result.body;
  const noSetup = body?.reason === ErrorReason.NoSetup;
  // A parallel confirm may have won and removed the setup: the account says whether TOTP is on.
  if (noSetup) await fetchUserDetails();
  isConfirming.value = false;
  if (result.ok) return emit("done", result.data);

  /** When the next try could go: now, or after a 429's wait. */
  let next = Date.now();
  if (result.status === HttpStatus.BadRequest) {
    refused.value = true;
    const attemptsLeft = body?.attemptsLeft;
    if (noSetup) {
      if (!mfa.value.totp) return runOut(true, Messages.Mfa.totpSetupGone);
      // Moving, TOTP was on already: a won move and a replaced setup look the same.
      return props.moving ? runOut(true, Messages.Mfa.totpMoveUnclear) : emit("turnedOnElsewhere");
    }
    if (body?.reason === ErrorReason.SetupExpired) return runOut(true, ranOutOfTime);
    if (body?.reason === ErrorReason.SetupTriesUsedUp || attemptsLeft === 0) {
      return runOut(true, Messages.Mfa.totpSetupTriesUsedUp(Limits.Mfa.totpSetupAttempts));
    }
    left.value = typeof attemptsLeft === "number" ? attemptsLeft : undefined;
    // The API's text asks to "request a new one", which an app's code can't be.
    refusal.value =
      left.value === undefined || left.value === 1
        ? Messages.Mfa.totpCodeRefused
        : `${Messages.Mfa.totpCodeRefused} ${Messages.Mfa.triesLeft(left.value)}`;
  } else {
    error.value = result.error;
    if (result.status === HttpStatus.TooManyRequests) {
      const wait = retryAfterFrom(result.body);
      hold.start(wait);
      next += wait * 1000;
    }
  }
  // The busy key gave up the focus, which goes on to what replaces the form.
  if (next >= deadline) return runOut(true);
  await nextTick();
  focusField();
};

/**
 * The setup can't be confirmed any more: the message (`why`) replaces it, and takes the focus if it
 * was in the panel (or `focus` says to), so it isn't lost with the field.
 */
const runOut = async (
  focus = panel.value?.contains(document.activeElement),
  why = ranOutOfTime
) => {
  ending.value = why;
  emit("expire");
  await nextTick();
  if (focus) ranOutMessage.value?.$el.focus();
};

// Left open, the setup runs out on screen too, so a QR code scanned later isn't a dead one. A code
// on its way may still turn it on (and bring the only copy of the recovery codes), so its answer
// decides: a refusal past the deadline runs the setup out then.
const timer = setTimeout(() => {
  if (!isConfirming.value) void runOut();
}, deadline - Date.now());
onBeforeUnmount(() => clearTimeout(timer));

const cancel = () => {
  if (!isConfirming.value) emit("cancel");
};

onMounted(() => title.value?.focus());
</script>

<template>
  <div ref="panel" class="setup" role="group" :aria-labelledby="titleId" @keydown.esc="cancel">
    <h4 :id="titleId" ref="title" class="setup__title" tabindex="-1">
      {{ ranOut ? "Setup ended" : moving ? "Scan with your new app" : "Scan the QR code" }}
    </h4>

    <template v-if="!setup">
      <!-- Held by the code checks' 429 past the setup's end: a new one waits for it too. -->
      <StatusMessage ref="ranOutMessage" class="setup__ran-out" tone="info" tabindex="-1">{{
        isHeld ? Messages.Mfa.totpSetupHeldOut : ending
      }}</StatusMessage>
      <div class="setup__actions">
        <BaseButton
          size="sm"
          :disabled="isHeld || isConfirming"
          :aria-label="isHeld ? hold.name.value : undefined"
          @click="emit('restart')"
        >
          {{ isHeld ? hold.label.value : "Start again" }}
        </BaseButton>
        <BaseButton size="sm" variant="ghost" @click="cancel">Cancel</BaseButton>
      </div>
    </template>

    <template v-else>
      <p class="setup__note">
        Scan it with your authenticator app, like Aegis, Google Authenticator or 1Password, then
        enter the code it shows.
        <template v-if="moving">Your current app keeps working until then.</template>
      </p>
      <div class="setup__scan">
        <svg
          class="setup__qr"
          :viewBox="`0 0 ${qr.size} ${qr.size}`"
          role="img"
          aria-label="QR code for your authenticator app"
          shape-rendering="crispEdges"
        >
          <path :d="qr.path" fill="currentColor" />
        </svg>
        <div class="setup__key">
          <p class="setup__label">Can't scan it? Type this key instead:</p>
          <code class="setup__secret">{{ groupedSecret }}</code>
          <div class="setup__actions">
            <BaseButton size="sm" variant="secondary" @click="copy(setup.secret)">
              <AppIcon :name="copied ? 'check' : 'copy'" :size="16" />
              {{ copied ? "Copied" : "Copy key" }}
            </BaseButton>
            <!-- On the phone the app is on, the link adds it there, with nothing to scan. -->
            <BaseButton size="sm" variant="secondary" :href="setup.otpauthUrl">
              <AppIcon name="phone" :size="16" />
              Open in app
            </BaseButton>
          </div>
          <p class="visually-hidden" role="status">
            {{ copied ? "Key copied." : failed ? "Couldn't copy: select the key instead." : "" }}
          </p>
        </div>
      </div>

      <form ref="form" class="setup__form" novalidate @submit.prevent="confirm">
        <BaseInput
          v-model="code"
          label="Code from your app"
          :hint="hint"
          inputmode="numeric"
          autocomplete="one-time-code"
          mono
          :error="refusal || errors.code"
          required
          @blur="leave('code')"
        />
        <StatusMessage v-if="shownError" :id="errorId" tone="error" :spoken="hold.spokenFor()">{{
          shownError
        }}</StatusMessage>
        <div class="setup__actions">
          <BaseButton
            type="submit"
            size="sm"
            :disabled="isHeld"
            :aria-label="isHeld ? hold.name.value : undefined"
            :aria-describedby="isHeld ? statusTextId(errorId) : undefined"
            :blocked="!isValid"
            :loading="isConfirming"
          >
            {{
              isConfirming
                ? moving
                  ? "Moving"
                  : "Turning on"
                : isHeld
                  ? hold.label.value
                  : moving
                    ? "Move to this app"
                    : "Turn on"
            }}
          </BaseButton>
          <!-- A refused code may be the app's clock or an old entry: a new setup is a way out. -->
          <BaseButton
            v-if="refused"
            size="sm"
            variant="secondary"
            :disabled="isConfirming"
            @click="emit('restart')"
          >
            Start again
          </BaseButton>
          <BaseButton size="sm" variant="ghost" :disabled="isConfirming" @click="cancel">
            Cancel
          </BaseButton>
        </div>
      </form>
    </template>
  </div>
</template>

<style scoped>
/* Opens in place under the row's note, a sunk panel like the recovery codes. */
.setup {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-4);
  margin-top: var(--sp-2);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.setup__title {
  font-size: 1.125rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.setup__ran-out {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.setup__note,
.setup__label {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}

.setup__scan {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-4);
}

/*
 * Dark modules on the light theme's panel in both themes, and in forced colours: some apps can't
 * read a light-on-dark code. Large enough for a long username's denser code.
 */
.setup__qr {
  color-scheme: light;
  forced-color-adjust: none;
  flex: none;
  width: min(100%, 14rem);
  height: auto;
  aspect-ratio: 1;
  border: var(--edge) solid var(--c-hairline);
  border-radius: var(--radius-sm);
  background: var(--c-panel);
  color: var(--c-ink);
}

.setup__key {
  flex: 1 1 12rem;
  min-width: 0;
  display: grid;
  justify-items: start;
  gap: var(--sp-2);
}

/* Groups of four, which wrap whole on a narrow phone or a large font. */
.setup__secret {
  font-family: var(--font-code);
  font-weight: 500;
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
}

.setup__form {
  display: grid;
  gap: var(--sp-4);
}

.setup__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
