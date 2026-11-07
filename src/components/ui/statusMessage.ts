/**
 * The id of the text a Status Message with the id `id` shows, without its `spoken` part: what a
 * key points `aria-describedby` at, so a held key's description is the message as seen and its
 * counting name stays the one wait it states (the spoken wait is fixed when the hold starts).
 */
export const statusTextId = (id: string) => `${id}-text`;
