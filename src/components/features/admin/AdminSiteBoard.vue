<script setup lang="ts">
import { computed, onMounted } from "vue";
import { Messages } from "@/constants/messages";
import { useAdminOverview } from "@/composables/useAdminOverview";
import { formatBytes } from "@/scripts/utility/sizeUtil";
import StationBoard from "@/components/ui/StationBoard.vue";
import StatusMessage from "@/components/ui/StatusMessage.vue";
import MailBudgetMeter from "./MailBudgetMeter.vue";

const { stats, statsError, mailBudget, mailBudgetError, load } = useAdminOverview();
onMounted(load);

const count = (value: number) => value.toLocaleString();

/** The ledger's rows: a label, its figure, and what the figure counts when the label alone doesn't say. */
const totals = computed(() => {
  const site = stats.value!;
  return [
    { label: "Users", figure: count(site.users) },
    { label: "Pastes", figure: count(site.pastes) },
    { label: "Short links", figure: count(site.shortUrls) },
    {
      label: "Uploads",
      figure: count(site.uploads.total),
      about: `${count(site.uploads.public)} public, ${count(site.uploads.private)} private`
    },
    {
      label: "Stored",
      figure: formatBytes(site.uploads.storedBytes),
      about: "All uploads together"
    },
    {
      label: "Sign-ups waiting",
      figure: count(site.pendingRegistrations),
      about: "For their e-mail code"
    }
  ];
});

const settings = computed(() => {
  const { defaultUploadQuotaBytes, maxFileSizeBytes } = stats.value!.settings;
  return [
    {
      label: "Default quota",
      figure: formatBytes(defaultUploadQuotaBytes),
      about: "For users without their own"
    },
    { label: "Largest file", figure: formatBytes(maxFileSizeBytes), about: "One upload can take" }
  ];
});
</script>

<template>
  <StationBoard title="Site">
    <div class="site">
      <div class="site__parts">
        <section class="part" aria-labelledby="site-totals">
          <h3 id="site-totals" class="part__title">Totals</h3>
          <StatusMessage v-if="statsError" tone="error">{{ statsError }}</StatusMessage>
          <p v-else-if="!stats" class="part__note">{{ Messages.Admin.statsLoading }}</p>
          <template v-if="stats">
            <dl class="ledger">
              <div v-for="row in totals" :key="row.label" class="ledger__row">
                <dt>
                  {{ row.label }}
                  <span v-if="row.about" class="ledger__about">{{ row.about }}</span>
                </dt>
                <dd>{{ row.figure }}</dd>
              </div>
            </dl>
            <h3 class="part__title">Upload settings</h3>
            <dl class="ledger">
              <div v-for="row in settings" :key="row.label" class="ledger__row">
                <dt>
                  {{ row.label }}
                  <span class="ledger__about">{{ row.about }}</span>
                </dt>
                <dd>{{ row.figure }}</dd>
              </div>
            </dl>
          </template>
        </section>

        <section class="part" aria-labelledby="site-mail">
          <h3 id="site-mail" class="part__title">Mail today</h3>
          <StatusMessage v-if="mailBudgetError" tone="error">{{ mailBudgetError }}</StatusMessage>
          <p v-else-if="!mailBudget" class="part__note">{{ Messages.Admin.mailBudgetLoading }}</p>
          <MailBudgetMeter v-if="mailBudget" :budget="mailBudget" />
        </section>
      </div>
    </div>
  </StationBoard>
</template>

<style scoped>
.site {
  container-type: inline-size;
}

.site__parts {
  display: grid;
  gap: var(--sp-7);
}

.part {
  display: grid;
  align-content: start;
  gap: var(--sp-4);
}

/* Like the Account Board's section headings. */
.part__title {
  font-size: 1.25rem;
  letter-spacing: 0.04em;
  line-height: 1.1;
  text-transform: uppercase;
}

.part__title:not(:first-child) {
  margin-top: var(--sp-3);
}

.part__note {
  color: var(--c-ink-soft);
  font-weight: 600;
}

/* Label left, figure right, on hairline dividers: read down like a timetable. */
.ledger {
  display: grid;
  margin: 0;
  border-top: var(--edge) solid var(--c-hairline);
}

.ledger__row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
}

.ledger dt {
  display: grid;
  font-weight: 600;
}

.ledger__about {
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--c-ink-soft);
}

.ledger dd {
  margin: 0;
  font-family: var(--font-board);
  font-size: var(--fs-md);
  font-weight: 700;
  line-height: 1.1;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

@container (min-width: 44rem) {
  .site__parts {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
    gap: var(--sp-7);
  }
}
</style>
