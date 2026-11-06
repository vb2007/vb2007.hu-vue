import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { useLatestRequest } from "@/composables/useLatestRequest";
import { apiRequest } from "@/scripts/api/client";
import type { AdminUser, AdminUserDetails } from "@/types/api/admin";

/** One account for the superuser: its details, logins and content, and its upload quota. */
export const useAdminUser = () => {
  const user = ref<AdminUserDetails | null>(null);
  const isLoading = ref(false);
  const errorMessage = ref("");
  /** Whether trying the load again could help: not for a link that leads to no account. */
  const canRetry = ref(false);
  const isSavingQuota = ref(false);
  const quotaError = ref("");

  const latest = useLatestRequest();

  const load = async (id: string) => {
    const signal = latest.next();
    isLoading.value = true;
    errorMessage.value = "";
    canRetry.value = false;
    // A save still on its way belongs to the account that was on show.
    isSavingQuota.value = false;
    quotaError.value = "";
    user.value = null;

    const result = await apiRequest(Endpoints.Admin.user, {
      params: { id },
      failure: Messages.Admin.userFailed,
      // A mistyped or old link, not a fault.
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.NotFound],
      signal
    });
    // Another account's load replaced this one, or the page is gone.
    if (signal.aborted) return;

    if (result.ok) {
      user.value = result.data.user;
    } else if (result.status === HttpStatus.BadRequest) {
      errorMessage.value = Messages.Admin.userInvalidId;
    } else if (result.status === HttpStatus.NotFound) {
      errorMessage.value = Messages.Admin.userNotFound;
    } else {
      errorMessage.value = result.error;
      canRetry.value = true;
    }
    isLoading.value = false;
  };

  /**
   * Takes the account as an admin action answered it (an `AdminUser`, without the page's details)
   * and keeps the details it doesn't carry. The quota, rename and suspension routes answer this way.
   */
  const applyUser = (updated: AdminUser) => {
    if (user.value?.id === updated.id) user.value = { ...user.value, ...updated };
  };

  /**
   * Sets the account's quota in bytes, or `null` for the default. Returns whether it worked. An
   * answer that lands once another account is on show leaves that account's page alone.
   */
  const setQuota = async (id: string, quotaBytes: number | null) => {
    isSavingQuota.value = true;
    quotaError.value = "";

    const result = await apiRequest(Endpoints.Admin.setUploadQuota, {
      params: { id },
      body: { quotaBytes },
      failure: Messages.Admin.quotaFailed
    });

    if (user.value?.id === id) {
      if (result.ok) applyUser(result.data.user);
      else quotaError.value = result.error;
      isSavingQuota.value = false;
    }
    return result.ok;
  };

  return {
    user,
    isLoading,
    errorMessage,
    canRetry,
    load,
    applyUser,
    isSavingQuota,
    quotaError,
    setQuota
  };
};
