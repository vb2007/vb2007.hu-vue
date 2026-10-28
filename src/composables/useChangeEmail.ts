import { ref } from "vue";
import { UserManagement } from "@/constants/api";
import { fetchUserDetails } from "@/scripts/authentication/user";
import { errorFrom } from "@/scripts/pastebin/paste";

/** Changes the logged-in user's e-mail address (vb2007/vb2007.hu-api#162). */
export const useChangeEmail = () => {
  const isChanging = ref(false);
  const changeError = ref("");
  const changeMessage = ref("");

  /** Returns whether it worked; the user is refreshed so the new address shows. */
  const change = async (email: string, password: string) => {
    let changed = false;

    try {
      isChanging.value = true;
      changeError.value = "";
      changeMessage.value = "";

      const response = await fetch(UserManagement.Actions.userEmail, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include"
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        changeMessage.value = data.message ?? "E-mail address updated.";
        await fetchUserDetails();
        changed = true;
      } else {
        changeError.value = await errorFrom(response, "Failed to change e-mail");
        console.error("Failed to change e-mail: ", response.status);
      }
    } catch (error) {
      changeError.value = "Error connecting to server";
      console.error("Error changing e-mail: ", error);
    } finally {
      isChanging.value = false;
    }

    return changed;
  };

  return { isChanging, changeError, changeMessage, change };
};
