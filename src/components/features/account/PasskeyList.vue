<script setup lang="ts">
/**
 * The account's passkeys (vb2007/vb2007.hu-api#446), loaded while `GET /user` counts any, and
 * "Add a passkey" under them. A rename reloads the list; an add or a delete looks the account up
 * again, whose new count reloads it.
 */
import { ref, watch } from "vue";
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

const emit = defineEmits<{ start: []; done: [message: string] }>();

const passkeys = ref<Passkey[]>([]);
const error = ref("");
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

/** `changed`: the account's passkeys changed, not only a name. */
const onDone = async (message: string, changed: boolean) => {
  emit("done", message);
  await (changed ? fetchUserDetails() : load());
};
</script>

<template>
  <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>
  <ul v-if="passkeys.length" class="passkeys" aria-label="Your passkeys">
    <PasskeyRow
      v-for="passkey in passkeys"
      :key="passkey.id"
      :passkey="passkey"
      @start="emit('start')"
      @done="onDone"
    />
  </ul>
  <PasskeyAdd @start="emit('start')" @done="onDone($event, true)" />
</template>

<style scoped>
.passkeys {
  display: grid;
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>
