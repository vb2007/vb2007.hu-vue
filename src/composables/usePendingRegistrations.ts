import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { usePagedList } from "@/composables/usePagedList";
import { apiRequest } from "@/scripts/api/client";

export const PENDING_REGISTRATIONS_PER_PAGE = 20;

/** The sign-ups waiting for their code, a page at a time, and removing them (no sort). */
export const usePendingRegistrations = (limit = PENDING_REGISTRATIONS_PER_PAGE) => {
  const {
    items: registrations,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    load,
    goToPage,
    reloadAfterRemove
  } = usePagedList({
    limit,
    fetch: (listQuery, signal) =>
      apiRequest(Endpoints.Admin.pendingRegistrations, {
        query: listQuery,
        failure: Messages.Admin.pendingRegistrationsFailed,
        signal
      }),
    items: (data) => data.pendingRegistrations
  });
  const removingId = ref("");
  const removeError = ref("");

  const remove = async (id: string) => {
    removingId.value = id;
    removeError.value = "";

    const result = await apiRequest(Endpoints.Admin.removePendingRegistration, {
      params: { id },
      failure: Messages.Admin.removePendingRegistrationFailed
    });

    if (!result.ok) removeError.value = result.error;
    // Gone either way once the API can't find it (verified or removed meanwhile), so the list
    // shouldn't keep offering it.
    if (result.ok || result.status === HttpStatus.NotFound) await reloadAfterRemove();
    removingId.value = "";
  };

  return {
    registrations,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    removingId,
    removeError,
    load,
    goToPage,
    remove
  };
};
