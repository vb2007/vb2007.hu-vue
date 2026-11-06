import { onScopeDispose, ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { apiRequest } from "@/scripts/api/client";
import { userId, username } from "@/scripts/authentication/authState";
import { fetchUserDetails } from "@/scripts/authentication/user";
import type { AdminUser } from "@/types/api/admin";

/** How long an armed key waits for its second click. */
export const ARMED_MS = 4000;

/**
 * A key that takes two clicks, like an upload's Delete: the first arms it, the second goes ahead.
 * The armed state wears off after `ARMED_MS`, or with `disarm` (Escape on the key).
 */
export const useArmedKey = () => {
  const armed = ref(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const disarm = () => {
    clearTimeout(timer);
    armed.value = false;
  };

  /** A click on the key: returns whether to go ahead, which it does once it was armed. */
  const press = () => {
    if (armed.value) {
      disarm();
      return true;
    }
    armed.value = true;
    timer = setTimeout(disarm, ARMED_MS);
    return false;
  };

  onScopeDispose(disarm);
  return { armed, press, disarm };
};

/** Whether `id` is the logged-in superuser's own account. */
const isOwnAccount = (id: string) => id === userId.value;

/**
 * Renames an account (vb2007/vb2007.hu-api#274). The API's refusals of the name (too short or
 * long, 400; taken, also in another case, 409) are the field's; anything else is the form's.
 */
export const useAdminRename = () => {
  const isRenaming = ref(false);
  const fieldError = ref("");
  const renameError = ref("");

  /** Returns the renamed account, or `undefined` when it failed. */
  const rename = async (id: string, name: string): Promise<AdminUser | undefined> => {
    isRenaming.value = true;
    fieldError.value = renameError.value = "";

    const result = await apiRequest(Endpoints.Admin.renameUser, {
      params: { id },
      body: { username: name.trim() },
      failure: Messages.Admin.renameFailed,
      // A name the API refused: the field says why.
      quietStatuses: [HttpStatus.BadRequest, HttpStatus.Conflict]
    });

    if (result.ok) {
      // The superuser renamed their own account: the navbar and Account page follow.
      if (isOwnAccount(id)) username.value = result.data.user.username;
    } else if (result.status === HttpStatus.BadRequest || result.status === HttpStatus.Conflict) {
      fieldError.value = result.error;
    } else {
      renameError.value = result.error;
    }
    isRenaming.value = false;
    return result.ok ? result.data.user : undefined;
  };

  return { isRenaming, fieldError, renameError, rename };
};

/** Ends every session of an account (vb2007/vb2007.hu-api#275). */
export const useAdminLogout = () => {
  const isLoggingOut = ref(false);
  const logoutError = ref("");
  const loggedOut = ref("");

  const logOut = async (id: string) => {
    isLoggingOut.value = true;
    logoutError.value = loggedOut.value = "";

    const result = await apiRequest(Endpoints.Admin.logoutUser, {
      params: { id },
      failure: Messages.Admin.logoutFailed
    });

    if (result.ok) {
      loggedOut.value = Messages.Admin.loggedOut(result.data.user.username);
      // The superuser's own account: the API ended this session too. Asking it again logs the
      // page out the usual way, so the admin area turns into its log-in gate.
      if (isOwnAccount(id)) await fetchUserDetails();
    } else {
      logoutError.value = result.error;
    }
    isLoggingOut.value = false;
  };

  return { isLoggingOut, logoutError, loggedOut, logOut };
};

/** Deletes an account with its pastes, short links and uploads (vb2007/vb2007.hu-api#276). */
export const useAdminDelete = () => {
  const isDeleting = ref(false);
  const deleteError = ref("");

  /** Returns whether it worked. */
  const remove = async (id: string) => {
    isDeleting.value = true;
    deleteError.value = "";

    const result = await apiRequest(Endpoints.Admin.deleteUser, {
      params: { id },
      failure: Messages.Admin.deleteFailed
    });

    if (!result.ok) deleteError.value = result.error;
    isDeleting.value = false;
    return result.ok;
  };

  return { isDeleting, deleteError, remove };
};
