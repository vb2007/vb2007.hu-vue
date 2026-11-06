<script setup lang="ts">
/**
 * One account for the superuser: who it is and how it logs in, what it owns, its upload storage
 * with the quota editor, and the Actions that can be taken on it.
 */
import { computed, useId, watch } from "vue";
import { AdminRoutes } from "@/constants/admin";
import { useAdminUser } from "@/composables/useAdminUser";
import { formatDate, formatDateTime } from "@/scripts/utility/dateUtil";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminQuotaEditor from "./AdminQuotaEditor.vue";
import AdminQuotaMeter from "./AdminQuotaMeter.vue";
import AdminUserAction from "./AdminUserAction.vue";
import AdminUserTags from "./AdminUserTags.vue";

const props = defineProps<{ id: string }>();

const { user, isLoading, errorMessage, load, isSavingQuota, quotaError, setQuota } = useAdminUser();
watch(() => props.id, load, { immediate: true });

const storageTitle = useId();
const actionsTitle = useId();

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

const content = computed(() => {
  const { pastes, shortUrls, uploads } = user.value!.counts;
  return [
    plural(pastes, "paste", "pastes"),
    plural(shortUrls, "short link", "short links"),
    plural(uploads, "upload", "uploads")
  ].join(" · ");
});

const password = computed(() => {
  if (user.value!.hasPassword) return "Set";
  return user.value!.githubLogin ? "None: logs in with GitHub only" : "None";
});
</script>

<template>
  <StationBoard :title="user?.username ?? 'Account'" as="h1">
    <p v-if="isLoading" class="note">Loading the account…</p>

    <StatusMessage v-else-if="errorMessage" tone="error">{{ errorMessage }}</StatusMessage>

    <div v-else-if="user" class="sheet">
      <div class="summary">
        <p class="note">
          Joined <time :datetime="user.createdAt">{{ formatDate(user.createdAt) }}</time>
        </p>
        <AdminUserTags :user="user" />
      </div>

      <dl class="facts">
        <div class="fact">
          <dt>Username</dt>
          <dd>{{ user.username }}</dd>
        </div>
        <!-- The badge waits out a change, like on the Account board, so it can't be read as being about the new address. -->
        <div class="fact">
          <dt>E-mail</dt>
          <dd>
            {{ user.email }}
            <span v-if="user.emailVerified && !user.pendingEmail" class="badge">
              <AppIcon name="check" :size="14" />
              Confirmed
            </span>
            <span v-else-if="!user.emailVerified" class="fact__soft">(not confirmed)</span>
          </dd>
        </div>
        <div v-if="user.pendingEmail" class="fact">
          <dt>Changing to</dt>
          <dd>
            {{ user.pendingEmail }}
            <span class="fact__soft">(waiting for its code)</span>
          </dd>
        </div>
        <div class="fact">
          <dt>Password</dt>
          <dd>{{ password }}</dd>
        </div>
        <div class="fact">
          <dt>GitHub</dt>
          <dd>
            <template v-if="user.githubLogin">@{{ user.githubLogin }}</template>
            <span v-else class="fact__soft">Not linked</span>
          </dd>
        </div>
        <div v-if="user.suspendedAt" class="fact fact--suspended">
          <dt>Suspended</dt>
          <dd>
            Since <time :datetime="user.suspendedAt">{{ formatDateTime(user.suspendedAt) }}</time
            >: they can't log in.
          </dd>
        </div>
        <div class="fact">
          <dt>Owns</dt>
          <dd class="fact__figures">{{ content }}</dd>
        </div>
        <div class="fact">
          <dt>ID</dt>
          <dd>
            <code class="fact__id">{{ user.id }}</code>
          </dd>
        </div>
      </dl>

      <section class="part" :aria-labelledby="storageTitle">
        <h2 :id="storageTitle" class="part__title">Upload storage</h2>
        <div class="storage">
          <div class="storage__usage">
            <AdminQuotaMeter :user="user" />
            <p class="note note--plain">
              {{ user.uploads.usedBytes.toLocaleString() }} bytes used, on
              {{ user.uploads.hasCustomQuota ? "a custom quota" : "the default quota" }}.
              <template v-if="user.uploads.usedBytes > user.uploads.quotaBytes">
                <strong class="over"
                  >Over by
                  {{ formatBytes(user.uploads.usedBytes - user.uploads.quotaBytes) }}.</strong
                >
              </template>
            </p>
          </div>
          <div class="storage__editor">
            <StatusMessage v-if="quotaError" tone="error">{{ quotaError }}</StatusMessage>
            <AdminQuotaEditor :user="user" :saving="isSavingQuota" :set-quota="setQuota" />
          </div>
        </div>
      </section>

      <!--
        One AdminUserAction per thing the admin can do to the account, each with its key and any
        form it opens in place (#panel). Rename, log out and suspend go after Uploads; Delete
        account stays last.
      -->
      <section class="part" :aria-labelledby="actionsTitle">
        <h2 :id="actionsTitle" class="part__title">Actions</h2>
        <div class="actions">
          <AdminUserAction title="Uploads" icon="upload">
            <template v-if="user.counts.uploads">
              Open, rename, make private or delete {{ user.username }}'s
              {{ plural(user.counts.uploads, "upload", "uploads") }}.
            </template>
            <template v-else>{{ user.username }} has no uploads.</template>
            <template #key>
              <!-- The name goes along, so the uploads page can say whose they are before they load. -->
              <BaseButton
                size="sm"
                variant="secondary"
                :to="{
                  name: AdminRoutes.userUploads,
                  params: { id: user.id },
                  state: { uploadsOwner: user.username }
                }"
              >
                Browse uploads
              </BaseButton>
            </template>
          </AdminUserAction>
        </div>
      </section>
    </div>
  </StationBoard>
</template>

<style scoped>
.note {
  color: var(--c-ink-soft);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.note--plain {
  font-size: var(--fs-sm);
  font-weight: 400;
}

.over {
  color: var(--c-ink);
  font-weight: 600;
}

/* Lays out by the board's width, not the viewport's. */
.sheet {
  display: grid;
  gap: var(--sp-6);
  container-type: inline-size;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2) var(--sp-4);
  margin-bottom: calc(-1 * var(--sp-3));
}

/* A ledger: Soft Ink labels and ink values on hairline dividers, labels beside the values once there's room. */
.facts {
  display: grid;
  margin: 0;
  border-top: var(--edge) solid var(--c-hairline);
}

.fact {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-3) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.fact dt {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--c-ink-soft);
}

.fact dd {
  margin: 0;
  min-width: 0;
  font-weight: 500;
  overflow-wrap: anywhere;
}

/* Notes and the badge follow the value on its line, and move to the next one whole. */
.fact__soft {
  display: inline-block;
  color: var(--c-ink-soft);
  font-weight: 400;
}

.fact__figures {
  font-variant-numeric: tabular-nums;
}

.fact__id {
  font-family: var(--font-code);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}

.fact--suspended dd {
  color: var(--c-danger);
  font-weight: 600;
}

.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 0.125rem var(--sp-2);
  border: var(--edge) solid currentColor;
  border-radius: 999px;
  background: var(--c-ok-wash);
  color: var(--c-action);
  font-family: var(--font-board);
  font-size: 0.9375rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  vertical-align: middle;
}

@container (min-width: 30rem) {
  .fact {
    grid-template-columns: 8rem minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sp-4);
  }
}

.part {
  display: grid;
  gap: var(--sp-3);
}

.part__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.storage,
.storage__usage,
.storage__editor {
  display: grid;
  align-content: start;
  gap: var(--sp-4);
}

.storage__usage {
  gap: var(--sp-2);
}

@container (min-width: 40rem) {
  .storage {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--sp-6);
  }
}

.actions {
  display: grid;
  border-top: var(--edge) solid var(--c-hairline);
}
</style>
