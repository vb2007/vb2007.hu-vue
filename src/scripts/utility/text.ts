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
