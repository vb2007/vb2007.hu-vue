<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { adminUserPath, adminUserUploadsPath } from "@/constants/admin";
import type { AdminUser } from "@/types/api/admin";
import { formatDate } from "@/scripts/utility/dateUtil";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import AppIcon from "@/components/ui/AppIcon.vue";
import BaseButton from "@/components/ui/BaseButton.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import AdminQuotaEditor from "./AdminQuotaEditor.vue";
import AdminQuotaMeter from "./AdminQuotaMeter.vue";
import AdminUserTags from "./AdminUserTags.vue";

const props = defineProps<{
  user: AdminUser;
  saving: boolean;
  error: string;
  setQuota: (id: string, quotaBytes: number | null) => Promise<boolean>;
}>();

const detailsId = useId();
const expanded = ref(false);

const usage = computed(() => props.user.uploads);
</script>

<template>
  <li class="row" :class="{ 'row--open': expanded }">
    <div class="row__summary">
      <div class="row__who">
        <button
          class="row__name"
          type="button"
          :aria-expanded="expanded"
          :aria-controls="detailsId"
          @click="expanded = !expanded"
        >
          <span class="row__name-text">{{ user.username }}</span>
          <AppIcon class="row__chevron" name="chevron" :size="18" />
        </button>
        <p class="row__meta">
          {{ usage.count }} {{ usage.count === 1 ? "file" : "files" }} · joined
          <time :datetime="user.createdAt">{{ formatDate(user.createdAt) }}</time>
        </p>
      </div>

      <AdminUserTags class="row__tags" :user="user" />

      <AdminQuotaMeter class="row__measure" :user="user" />
    </div>

    <StatusMessage v-if="error" tone="error">{{ error }}</StatusMessage>

    <div v-if="expanded" :id="detailsId" class="details">
      <div class="about">
        <dl class="facts">
          <div class="facts__row">
            <dt>E-mail</dt>
            <dd>{{ user.email }}</dd>
          </div>
          <div class="facts__row">
            <dt>Used</dt>
            <dd>
              {{ formatBytes(usage.usedBytes) }}
              <span class="facts__soft">({{ usage.usedBytes.toLocaleString() }} bytes)</span>
            </dd>
          </div>
          <div class="facts__row">
            <dt>Quota</dt>
            <dd>
              {{ formatBytes(usage.quotaBytes) }}
              <span class="facts__soft">{{
                usage.hasCustomQuota ? "(custom)" : "(the default)"
              }}</span>
            </dd>
          </div>
          <div v-if="usage.usedBytes > usage.quotaBytes" class="facts__row facts__row--over">
            <dt>Over by</dt>
            <dd>{{ formatBytes(usage.usedBytes - usage.quotaBytes) }}</dd>
          </div>
        </dl>
        <div class="about__keys">
          <BaseButton size="sm" variant="secondary" :to="adminUserPath(user.id)">
            View account
          </BaseButton>
          <!-- The name goes along, so the uploads page can say whose they are before they load. -->
          <BaseButton
            size="sm"
            variant="secondary"
            :to="{ path: adminUserUploadsPath(user.id), state: { uploadsOwner: user.username } }"
          >
            Browse uploads
          </BaseButton>
        </div>
      </div>

      <AdminQuotaEditor :user="user" :saving="saving" :set-quota="setQuota" />
    </div>
  </li>
</template>

<style scoped>
.row {
  display: grid;
  gap: var(--sp-3);
  padding: var(--sp-4) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.row__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  grid-template-areas:
    "who tags"
    "measure measure";
  align-items: center;
  gap: var(--sp-3);
}

.row__who {
  grid-area: who;
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
}

.row__name {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  min-width: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-ink);
  font-weight: 600;
  font-size: var(--fs-base);
  text-align: left;
  cursor: pointer;
}

.row__name-text {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  text-decoration: underline;
  text-decoration-color: transparent;
  text-decoration-thickness: 2px;
  text-underline-offset: 0.2em;
  transition: text-decoration-color var(--dur-quick) ease;
}

.row__name:hover .row__name-text {
  text-decoration-color: var(--c-line);
}

.row__name:focus-visible {
  outline: 3px solid var(--c-line);
  outline-offset: 3px;
}

.row__chevron {
  flex: none;
  color: var(--c-ink-soft);
  transition: transform var(--dur-base) var(--ease-out);
}

.row--open .row__chevron {
  transform: rotate(180deg);
}

.row__meta {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.row__tags {
  grid-area: tags;
  justify-content: flex-end;
}

.row__measure {
  grid-area: measure;
}

@container (min-width: 40rem) {
  .row__summary {
    grid-template-columns: minmax(0, 1fr) auto minmax(12rem, 18rem);
    grid-template-areas: "who tags measure";
    gap: var(--sp-5);
  }
}

/* The row's own details, opened in place under it (never driven from hover). */
.details {
  display: grid;
  gap: var(--sp-4);
  padding: var(--sp-4);
  border: var(--edge) solid var(--c-edge);
  border-radius: var(--radius-md);
  background: var(--c-panel-sunk);
  animation: open var(--dur-base) var(--ease-out);
}

.about {
  display: grid;
  justify-items: start;
  gap: var(--sp-4);
}

.about__keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.facts {
  justify-self: stretch;
  display: grid;
  gap: var(--sp-2);
  margin: 0;
}

.facts__row {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) minmax(0, 1fr);
  gap: var(--sp-3);
  font-size: var(--fs-sm);
}

.facts dt {
  font-weight: 600;
  color: var(--c-ink-soft);
}

.facts dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}

.facts__soft {
  color: var(--c-ink-soft);
  font-variant-numeric: tabular-nums;
}

.facts__row--over dd {
  font-weight: 600;
}

@container (min-width: 40rem) {
  .details {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    align-items: start;
  }
}

@keyframes open {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
