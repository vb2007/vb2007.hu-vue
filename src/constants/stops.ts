export type StopStatus = "open" | "planned";

export interface Stop {
  id: string;
  label: string;
  to: string;
  status: StopStatus;
  /** One-line description shown in the home tools directory. */
  blurb: string;
}

export interface Line {
  id: string;
  name: string;
  stops: Stop[];
}

/**
 * The site's tools as a metro line. Open stops are routes that exist today,
 * planned stops are tools that have not been built yet.
 * Add a new tool by appending a stop here; the navbar strip and the home tools directory follow.
 */
export const TOOLS_LINE: Line = {
  id: "tools",
  name: "Tools",
  stops: [
    {
      id: "home",
      label: "Home",
      to: "/",
      status: "open",
      blurb: "Where every route starts."
    },
    {
      id: "shorten",
      label: "Shorten",
      to: "/shorten",
      status: "open",
      blurb: "Turn a long link into a short one."
    },
    {
      id: "paste",
      label: "Paste",
      to: "/pastebin",
      status: "open",
      blurb: "Share text and code snippets."
    },
    {
      id: "upload",
      label: "Upload",
      to: "/upload",
      status: "open",
      blurb: "Upload and share files."
    },
    {
      id: "contact",
      label: "Contact",
      to: "/contact",
      status: "planned",
      blurb: "Get in touch."
    }
  ]
};
