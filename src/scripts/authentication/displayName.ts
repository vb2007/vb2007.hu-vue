import { EMOJI_JOINERS, EMOJI_TAG_SEQUENCES } from "@/scripts/authentication/register";

/** Control, format, line and paragraph separator characters, which the API's `displayNameError` refuses. */
const INVALID_NAME_CHARACTER = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/** A name's three problems, in the words of what it names (`Messages.Passkeys`, `Messages.ApiKeys`). */
export interface DisplayNameMessages {
  nameMissing: string;
  nameInvalidCharacters: string;
  nameTooLong: (max: number) => string;
}

/**
 * A label's problem (a passkey's or an API key's name), "" when it has none, checked like the
 * API's `displayNameError`, in its order, on the trimmed name the site sends: the character rule
 * allows the joiners and tags inside emoji, as usernames do, and the length counts characters.
 */
export const displayNameError = (
  name: string,
  maxLength: number,
  messages: DisplayNameMessages
) => {
  const trimmed = name.trim();
  if (!trimmed) return messages.nameMissing;
  if (
    INVALID_NAME_CHARACTER.test(trimmed.replace(EMOJI_JOINERS, "").replace(EMOJI_TAG_SEQUENCES, ""))
  ) {
    return messages.nameInvalidCharacters;
  }
  return [...trimmed].length > maxLength ? messages.nameTooLong(maxLength) : "";
};

/** A name only gets too long by typing more: shown while typing. */
export const displayNameEarlyError = (
  name: string,
  maxLength: number,
  messages: DisplayNameMessages
) => (name.trim() ? displayNameError(name, maxLength, messages) : "");
