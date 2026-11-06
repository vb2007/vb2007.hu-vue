import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import type { AdminUser } from "@/types/api/admin";

/** Suspends an account, which ends its session, or lifts its suspension (vb2007/vb2007.hu-api#273). */
export const useAdminSuspension = () => {
  const isSaving = ref(false);
  const error = ref("");
  /** The API's word on the last change that worked. */
  const saved = ref("");

  /** Returns the account as the API answered it, or `null` when it failed. */
  const setSuspension = async (id: string, suspended: boolean): Promise<AdminUser | null> => {
    isSaving.value = true;
    error.value = "";
    saved.value = "";

    const result = await apiRequest(Endpoints.Admin.setSuspension, {
      params: { id },
      body: { suspended },
      failure: suspended ? Messages.Admin.suspendFailed : Messages.Admin.unsuspendFailed
    });

    isSaving.value = false;
    if (!result.ok) {
      error.value = result.error;
      return null;
    }
    saved.value = result.data.message;
    return result.data.user;
  };

  return { isSaving, error, saved, setSuspension };
};
