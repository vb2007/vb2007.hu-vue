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

/** The parts of an address, for a list that leads with the host it goes to. */
export interface AddressParts {
  /** The scheme when it isn't the web's (`ftp://`), else "". */
  scheme: string;
  /** A `user@` before the host, which can pass for one, else "". */
  userinfo: string;
  /** The host the browser goes to, or "" for an address without one (`mailto:`, `data:`). */
  host: string;
  rest: string;
}

const WEB_SCHEMES = ["http:", "https:"];

/**
 * An address split into its scheme, userinfo, host and the rest. The host is the one `URL` finds,
 * as the browser does, so a trick such as `https://evil.example\@good.example` shows its real
 * host, `evil.example`, and the rest as the browser reads it. An address `URL` can't read (an
 * invisible character in its host, say) is split by its text instead; one without a host keeps
 * all of it in `rest`.
 */
export const addressParts = (address: string): AddressParts => {
  try {
    const url = new URL(address);
    if (url.host) {
      const credentials = url.password ? `${url.username}:${url.password}` : url.username;
      return {
        scheme: WEB_SCHEMES.includes(url.protocol) ? "" : `${url.protocol}//`,
        userinfo: credentials ? `${credentials}@` : "",
        host: url.host,
        rest: url.pathname + url.search + url.hash
      };
    }
  } catch {
    // Not one `URL` reads: split it by its text below.
  }
  const parts = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]*@)?([^/?#]*)(.*)$/is.exec(address);
  if (!parts) return { scheme: "", userinfo: "", host: "", rest: address };
  const [, scheme, userinfo = "", host, rest] = parts;
  return { scheme: /^https?:\/\/$/i.test(scheme) ? "" : scheme, userinfo, host, rest };
};

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
 * Whitespace, control and format characters, and the letters that render blank, which could pass
 * for spaces: U+115F Hangul choseong filler, U+1160 Hangul jungseong filler, U+2800 Braille pattern
 * blank, U+3164 Hangul filler and U+FFA0 halfwidth Hangul filler. U+200C zero-width non-joiner and
 * U+200D zero-width joiner are kept: they join Persian words and emoji sequences, and can't reorder
 * text.
 */
const UNSHOWN = /(?![\u200C\u200D])[\s\p{C}\u115F\u1160\u2800\u3164\uFFA0]/gu;

/**
 * A decoded address as it's safe to show in a sentence: anyone can link to one, so whitespace and
 * invisible or control characters (bidi overrides among them) go back to their escapes, which a
 * real address has anyway; so do combining marks past MAX_MARKS on one letter, which couldn't
 * wrap. Past MAX_ADDRESS characters it's cut with an ellipsis, never between a letter and its marks.
 */
export const readableAddress = (address: string): string => {
  const shown = address
    .replace(UNSHOWN, percentEncode)
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
