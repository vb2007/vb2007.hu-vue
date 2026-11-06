import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import type { AdminStatsResponse, MailBudgetResponse } from "@/types/api/admin";

/** The admin overview's figures: the site's totals and today's mail, each loaded and failing on its own. */
export const useAdminOverview = () => {
  const stats = ref<AdminStatsResponse | null>(null);
  const statsError = ref("");
  const mailBudget = ref<MailBudgetResponse | null>(null);
  const mailBudgetError = ref("");

  const loadStats = async () => {
    statsError.value = "";
    const result = await apiRequest(Endpoints.Admin.stats, { failure: Messages.Admin.statsFailed });
    if (result.ok) stats.value = result.data;
    else statsError.value = result.error;
  };

  const loadMailBudget = async () => {
    mailBudgetError.value = "";
    const result = await apiRequest(Endpoints.Admin.mailBudget, {
      failure: Messages.Admin.mailBudgetFailed
    });
    if (result.ok) mailBudget.value = result.data;
    else mailBudgetError.value = result.error;
  };

  const load = () => Promise.all([loadStats(), loadMailBudget()]);

  return { stats, statsError, mailBudget, mailBudgetError, load };
};
