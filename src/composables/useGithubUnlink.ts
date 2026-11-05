import { ref } from "vue";
import { Endpoints } from "@/constants/endpoints";
import { HttpStatus } from "@/constants/http";
import { Messages } from "@/constants/messages";
import { retryAfterFrom } from "@/composables/useCountdown";
import { useRetryHold } from "@/composables/useRetryHold";
import { apiErrorOf, apiRequest } from "@/scripts/api/client";
import { githubLinked, githubLogin } from "@/scripts/authentication/authState";

/**
 * Unlinks the logged-in user's GitHub account (vb2007/vb2007.hu-api#134), confirmed with the
 * account's password (vb2007/vb2007.hu-api#243).
 */
export const useGithubUnlink = () => {
  const isUnlinking = ref(false);
  const unlinkError = ref("");
  /** After the password checks' 429 (too many wrong passwords), unlinking waits its `retryAfter`. */
  const hold = useRetryHold(unlinkError);

  /** Returns whether it worked. */
  const unlink = async (password: string) => {
    isUnlinking.value = true;
    unlinkError.value = "";

    const result = await apiRequest(Endpoints.Auth.githubUnlink, {
      body: { password },
      failure: Messages.Account.githubUnlinkFailed
    });

    if (result.ok) {
      githubLinked.value = false;
      githubLogin.value = "";
    } else if (result.status === HttpStatus.TooManyRequests) {
      unlinkError.value = apiErrorOf(result) ?? Messages.Account.tooManyRequests;
      hold.start(retryAfterFrom(result.body));
    } else {
      unlinkError.value = result.error;
    }
    isUnlinking.value = false;

    return result.ok;
  };

  return { isUnlinking, unlinkError, unlink, hold };
};
