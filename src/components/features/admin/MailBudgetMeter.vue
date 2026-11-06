<script setup lang="ts">
import { computed } from "vue";
import { Messages } from "@/constants/messages";
import { mailLine, type MailStopKind } from "@/scripts/admin/mailBudget";
import { formatTime } from "@/scripts/utility/dateUtil";
import type { MailBudgetResponse } from "@/types/api/admin";
import StatusMessage from "@/components/ui/StatusMessage.vue";

const props = defineProps<{ budget: MailBudgetResponse }>();

/** What each stop means, as the API's mail helper does it. */
const STOP_LABELS: Record<MailStopKind, string> = {
  registration: "Sign-up codes stop",
  warning: "The API logs a warning",
  limit: "All mail stops"
};

const line = computed(() => mailLine(props.budget));
const count = (value: number) => value.toLocaleString();
const sent = computed(() => count(props.budget.sentToday));
const limit = computed(() => count(props.budget.dailyLimit));
const resetsAt = computed(() => formatTime(props.budget.resetsAt));
</script>

<template>
  <div class="mail" :class="{ 'mail--full': line.isFull }">
    <p class="mail__figure">
      <span class="mail__sent">{{ sent }}</span
      >{{ " " }}<span class="mail__of">of {{ limit }} sent</span>
    </p>

    <!-- Departure ring at 0, the run to today's count, a ring at each stop on the way, the terminus at the limit. -->
    <div
      class="mail__line"
      role="meter"
      aria-label="Mail sent today"
      aria-valuemin="0"
      :aria-valuemax="budget.dailyLimit"
      :aria-valuenow="Math.min(budget.sentToday, budget.dailyLimit)"
      :aria-valuetext="`${sent} of ${limit} sent`"
      :style="{ '--share': line.share }"
      :class="{ 'mail__line--some': budget.sentToday > 0 }"
    >
      <span class="mail__end mail__end--from" />
      <span class="mail__rail">
        <span class="mail__run" />
        <span
          v-for="mark in line.marks"
          :key="mark.share"
          class="mail__mark"
          :class="{ 'mail__mark--reached': mark.reached }"
          :style="{ '--mark': mark.share }"
        />
        <span v-if="!line.isFull" class="mail__here" />
      </span>
      <span class="mail__end mail__end--to" />
    </div>

    <ul class="stops" aria-label="Stops on today's mail">
      <li
        v-for="stop in line.stops"
        :key="stop.kind"
        class="stops__row"
        :class="[`stops__row--${stop.kind}`, { 'stops__row--reached': stop.reached }]"
      >
        <span class="stops__ring" aria-hidden="true" />
        <span class="stops__count">{{ count(stop.at) }}</span
        >{{ " " }}<span class="stops__what">{{ STOP_LABELS[stop.kind] }}</span
        ><template v-if="stop.reached"
          >{{ " " }}<span class="stops__reached">Reached</span></template
        >
      </li>
    </ul>

    <StatusMessage v-if="line.isFull" tone="error">
      {{ Messages.Admin.mailLimitReached(resetsAt) }}
    </StatusMessage>
    <StatusMessage v-else-if="line.registrationStopped" tone="info">
      {{ Messages.Admin.registrationMailStopped(budget.dailyLimit) }}
    </StatusMessage>

    <p class="mail__note">
      Counted by the API since midnight UTC or its last restart, whichever is later. It starts again
      from 0 at <time :datetime="budget.resetsAt">{{ resetsAt }}</time
      >.
    </p>
  </div>
</template>

<style scoped>
.mail {
  display: grid;
  gap: var(--sp-4);
}

.mail__figure {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--sp-1) var(--sp-2);
}

.mail__sent {
  font-family: var(--font-board);
  font-size: var(--fs-lg);
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.mail__of {
  color: var(--c-ink-soft);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

/* The Storage Gauge's line, with a ring at each stop the API counts to on the way. */
.mail__line {
  --at: calc(var(--share) * 100%);

  display: flex;
  align-items: center;
}

/* True to scale, except that any mail at all shows a few pixels of green. */
.mail__line--some {
  --at: max(0.25rem, calc(var(--share) * 100%));
}

.mail__end {
  flex: none;
  width: 1rem;
  height: 1rem;
  border: 3px solid var(--c-line);
  border-radius: 50%;
  background: var(--c-panel);
}

.mail__end--from {
  border-color: var(--c-action);
  background: var(--c-action);
}

.mail__end--to {
  width: 1.375rem;
  height: 1.375rem;
  border-width: 4px;
  border-color: var(--c-ink-soft);
}

.mail__rail {
  position: relative;
  flex: 1;
  height: 5px;
  margin: 0 -1px;
  background: var(--c-hairline);
}

.mail__run {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--at);
  background: var(--c-line);
  transform-origin: left;
  animation: travel var(--dur-slow) var(--ease-out);
}

.mail__mark,
.mail__here {
  position: absolute;
  top: 50%;
  border-radius: 50%;
  background: var(--c-panel);
  transform: translate(-50%, -50%);
}

.mail__mark {
  left: calc(var(--mark) * 100%);
  width: 0.875rem;
  height: 0.875rem;
  border: 3px solid var(--c-ink-soft);
}

.mail__mark--reached {
  border-color: var(--c-line);
}

.mail__here {
  left: var(--at);
  width: 1.125rem;
  height: 1.125rem;
  border: 4px solid var(--c-action);
  animation: arrive var(--dur-slow) var(--ease-out);
}

/* At the limit the run reaches the terminus, and both turn Fault Red. */
.mail--full .mail__run {
  width: 100%;
  background: var(--c-danger);
}

.mail--full .mail__mark,
.mail--full .mail__end--to {
  border-color: var(--c-danger);
}

.mail--full .mail__end--to {
  background: var(--c-danger);
}

@keyframes travel {
  from {
    transform: scaleX(0);
  }
}

@keyframes arrive {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.4);
  }
}

/* The stops in words: the line's text equivalent, in the order they come along it. */
.stops {
  display: grid;
  /* One set of columns for every row, so the counts line up whatever their width. */
  grid-template-columns: 1.375rem auto minmax(0, 1fr) auto;
  margin: 0;
  padding: 0;
  list-style: none;
  border-top: var(--edge) solid var(--c-hairline);
}

.stops__row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) 0;
  border-bottom: var(--edge) solid var(--c-hairline);
  font-size: var(--fs-sm);
}

.stops__ring {
  justify-self: center;
  width: 0.875rem;
  height: 0.875rem;
  border: 3px solid var(--c-ink-soft);
  border-radius: 50%;
  background: var(--c-panel);
}

.stops__row--reached .stops__ring {
  border-color: var(--c-line);
}

.stops__row--limit .stops__ring {
  width: 1.375rem;
  height: 1.375rem;
  border-width: 4px;
}

.mail--full .stops__row--reached .stops__ring {
  border-color: var(--c-danger);
}

.mail--full .stops__row--limit .stops__ring {
  background: var(--c-danger);
}

.stops__count {
  font-family: var(--font-board);
  font-size: var(--fs-md);
  font-weight: 700;
  line-height: 1;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.stops__what {
  font-weight: 600;
}

.stops__reached {
  font-weight: 600;
  color: var(--c-ink-soft);
}

.mail__note {
  font-size: var(--fs-sm);
  color: var(--c-ink-soft);
}
</style>
