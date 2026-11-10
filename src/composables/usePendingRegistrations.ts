import { ref, watch } from "vue";
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
  /** The rows whose remove is running; each keeps its own busy key. */
  const removingIds = ref(new Set<string>());
  /** The last failed remove, until the list loads again. */
  const removeError = ref("");

  // Sync, so a reload clears it as it starts, before a 404 sets it again.
  watch(
    isLoading,
    (loading) => {
      if (loading) removeError.value = "";
    },
    { flush: "sync" }
  );

  const remove = async (id: string) => {
    removingIds.value.add(id);
    removeError.value = "";

    const result = await apiRequest(Endpoints.Admin.removePendingRegistration, {
      params: { id },
      failure: Messages.Admin.removePendingRegistrationFailed
    });

    // Gone either way once the API can't find it (verified, expired or removed meanwhile), so the
    // list shouldn't keep offering it.
    if (result.ok || result.status === HttpStatus.NotFound) await reloadAfterRemove();
    if (!result.ok) removeError.value = result.error;
    removingIds.value.delete(id);
  };

  return {
    registrations,
    pagination,
    page,
    query,
    isLoading,
    errorMessage,
    removingIds,
    removeError,
    load,
    goToPage,
    remove
  };
};
