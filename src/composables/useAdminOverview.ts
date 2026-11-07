import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { useLatestRequest } from "@/composables/useLatestRequest";
import type { AdminStatsResponse, MailBudgetResponse } from "@/types/api/admin";

/**
 * The admin overview's figures: the site's totals and today's mail, each loaded and failing on its
 * own. Loading again keeps what's shown until each answer replaces it, and aborts a load still
 * in flight, as leaving the page does.
 */
export const useAdminOverview = () => {
  const stats = ref<AdminStatsResponse | null>(null);
  const statsError = ref("");
  const mailBudget = ref<MailBudgetResponse | null>(null);
  const mailBudgetError = ref("");
  const isLoading = ref(false);
  const latest = useLatestRequest();

  const loadStats = async (signal: AbortSignal) => {
    const result = await apiRequest(Endpoints.Admin.stats, {
      failure: Messages.Admin.statsFailed,
      signal
    });
    if (signal.aborted) return;
    if (result.ok) stats.value = result.data;
    statsError.value = result.ok ? "" : result.error;
  };

  const loadMailBudget = async (signal: AbortSignal) => {
    const result = await apiRequest(Endpoints.Admin.mailBudget, {
      failure: Messages.Admin.mailBudgetFailed,
      signal
    });
    if (signal.aborted) return;
    if (result.ok) mailBudget.value = result.data;
    mailBudgetError.value = result.ok ? "" : result.error;
  };

  const load = async () => {
    const signal = latest.next();
    isLoading.value = true;
    await Promise.all([loadStats(signal), loadMailBudget(signal)]);
    if (!signal.aborted) isLoading.value = false;
  };

  return { stats, statsError, mailBudget, mailBudgetError, isLoading, load };
};
