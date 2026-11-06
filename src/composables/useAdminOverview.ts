import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import type { AdminStatsResponse, MailBudgetResponse } from "@/types/api/admin";

/**
 * The admin overview's figures: the site's totals and today's mail, each loaded and failing on its
 * own. Loading again keeps what's shown until each answer replaces it.
 */
export const useAdminOverview = () => {
  const stats = ref<AdminStatsResponse | null>(null);
  const statsError = ref("");
  const mailBudget = ref<MailBudgetResponse | null>(null);
  const mailBudgetError = ref("");
  const isLoading = ref(false);

  const loadStats = async () => {
    const result = await apiRequest(Endpoints.Admin.stats, { failure: Messages.Admin.statsFailed });
    if (result.ok) stats.value = result.data;
    statsError.value = result.ok ? "" : result.error;
  };

  const loadMailBudget = async () => {
    const result = await apiRequest(Endpoints.Admin.mailBudget, {
      failure: Messages.Admin.mailBudgetFailed
    });
    if (result.ok) mailBudget.value = result.data;
    mailBudgetError.value = result.ok ? "" : result.error;
  };

  const load = async () => {
    isLoading.value = true;
    await Promise.all([loadStats(), loadMailBudget()]);
    isLoading.value = false;
  };

  return { stats, statsError, mailBudget, mailBudgetError, isLoading, load };
};
