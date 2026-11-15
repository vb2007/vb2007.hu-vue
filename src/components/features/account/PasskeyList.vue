<script setup lang="ts">
/**
 * The account's passkeys (vb2007/vb2007.hu-api#446), loaded while `GET /user` counts any, and
 * "Add a passkey" under them. A rename reloads the list; an add or a delete looks the account up
 * again, whose new count reloads it. Each outcome shows at the top of this section, focused, so a
 * keyboard user stays by the passkeys rather than at the top of the board.
 */
import { nextTick, ref, useTemplateRef, watch } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import { mfa } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import PasskeyAdd from "@/components/features/account/PasskeyAdd.vue";
import PasskeyRow from "@/components/features/account/PasskeyRow.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import type { Passkey } from "@/types/api/passkeys";

/** A form opened: the board's older notices go, like this section's. */
const emit = defineEmits<{ start: [] }>();

const passkeys = ref<Passkey[]>([]);
const error = ref("");
const notice = ref<{ text: string; tone: "success" | "info" } | null>(null);
const noticeMessage = useTemplateRef<InstanceType<typeof StatusMessage>>("noticeMessage");
const latest = useLatestRequest();

const load = async () => {
  const signal = latest.next();
  error.value = "";
  if (!mfa.value.passkeys) {
    passkeys.value = [];
    return;
  }
  const result = await apiRequest(Endpoints.User.passkeys, {
    failure: Messages.Passkeys.listFailed,
    signal
  });
  if (signal.aborted) return;
  if (result.ok) passkeys.value = result.data.passkeys;
  else error.value = result.error;
};

watch(() => mfa.value.passkeys, load, { immediate: true });

const onStart = () => {
  notice.value = null;
  emit("start");
};

/** Shows an outcome, focused, since the key it came from is gone; then the list catches up. */
const report = async (text: string, tone: "success" | "info", refresh: () => Promise<unknown>) => {
  notice.value = { text, tone };
  await nextTick();
  noticeMessage.value?.$el.focus();
  await refresh();
};

/** `changed`: the account's passkeys changed, not only a name. */
const onDone = (message: string, changed: boolean) =>
  report(message, "success", changed ? fetchUserDetails : load);
/** Gone already (deleted elsewhere): not a success of this page's. */
const onMissing = (message: string) => report(message, "info", fetchUserDetails);
</script>

<template>
  <StatusMessage
    v-if="notice"
    ref="noticeMessage"
    class="notice"
    :tone="notice.tone"
    tabindex="-1"
    >{{ notice.text }}</StatusMessage
  >
  <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>
  <ul v-if="passkeys.length" class="passkeys" aria-label="Your passkeys">
    <PasskeyRow
      v-for="passkey in passkeys"
      :key="passkey.id"
      :passkey="passkey"
      @start="onStart"
      @done="onDone"
      @missing="onMissing"
    />
  </ul>
  <PasskeyAdd @start="onStart" @done="onDone($event, true)" />
</template>

<style scoped>
.notice {
  scroll-margin-top: calc(var(--nav-h) + var(--sp-4));
}

.passkeys {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
