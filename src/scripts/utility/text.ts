const validURIType: string[] = [
  "acap://",
  "app://",
  "file://",
  "ftp://",
  "ftps://",
  "http://",
  "https://",
  "icap://",
  "imap://",
  "irc://",
  "mailto:",
  "ms-access:",
  "ms-excel:",
  "ms-infopath:",
  "ms-powerpoint:",
  "ms-project:",
  "ms-publisher:",
  "ms-spd:",
  "ms-visio:",
  "ms-word:",
  "msteams://",
  "mtqp://",
  "nntp://",
  "pop://",
  "rsync://",
  "rtmp://",
  "rtsp://",
  "sftp://",
  "shortcuts://",
  "smb://",
  "smtp://",
  "ssh://",
  "telnet://",
  "viber://",
  "webcal://",
  "wss://",
  "xmpp://",
  "zoomus://",
  "zoommtg://"
];

export const validateUrl = (originalUrl: string) => {
  try {
    if (
      !validURIType.some((uriType) => originalUrl.toLowerCase().startsWith(uriType.toLowerCase()))
    ) {
      return false;
    } else {
      return true;
    }
  } catch (error) {
    console.error("Error validating the url: ", error);
    return false;
  }
};

/** A link as people read it: no protocol, which every browser fills in anyway. */
export const displayLink = (link: string) => link.replace(/^https?:\/\//, "");

/** Combining marks kept on one letter: enough for any script's accents, too few to pile up. */
const MAX_MARKS = 2;

/** A longer address is cut here: the whole of it is still in the address bar. */
export const MAX_ADDRESS = 200;

/** `text` as UTF-8 percent escapes; unlike encodeURIComponent, never throws (on a lone surrogate). */
const percentEncode = (text: string) =>
  [...new TextEncoder().encode(text)]
    .map((byte) => "%" + byte.toString(16).toUpperCase().padStart(2, "0"))
    .join("");

/**
 * A decoded address as it's safe to show in a sentence: anyone can link to one, so whitespace and
 * invisible or control characters (bidi overrides among them) go back to their escapes, which a
 * real address has anyway; so do combining marks past MAX_MARKS on one letter, which couldn't
 * wrap. Past MAX_ADDRESS characters it's cut with an ellipsis, never between a letter and its marks.
 */
export const readableAddress = (address: string): string => {
  const shown = address
    .replace(/[\s\p{C}]/gu, percentEncode)
    .replace(new RegExp(`(?<=\\p{M}{${MAX_MARKS}})\\p{M}`, "gu"), percentEncode);

  const chars = [...shown];
  let end = MAX_ADDRESS;
  while (/\p{M}/u.test(chars[end] ?? "")) end++;
  return end < chars.length ? chars.slice(0, end).join("") + "…" : shown;
};

/** Schemes that would run code or load content on this site if it navigated to them. */
const unsafeSchemes = ["javascript:", "data:", "vbscript:", "blob:"];

/** Whether the site may send the browser to `url`, e.g. a short link's target. */
export const isSafeRedirect = (url: string) => {
  try {
    return !unsafeSchemes.includes(new URL(url).protocol);
  } catch {
    return false;
  }
};
