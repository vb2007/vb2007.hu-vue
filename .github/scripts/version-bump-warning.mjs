#!/usr/bin/env node
// Warns when package.json's version on origin/dev still equals origin/main's,
// because merging then releases a patch bump (next-version.mjs) rather than the
// minor/major the dev changes might deserve.
//
// Prints the warning, or nothing when the version was bumped. The merge commit
// release.yml versions is new, so it has no tags: headTags is empty.
import { execFileSync } from "node:child_process";
import { nextVersion } from "./next-version.mjs";

export function versionBumpWarning({ devVersion, mainVersion, tags }) {
  if (devVersion !== mainVersion) return null;

  const { version } = nextVersion({ packageVersion: mainVersion, tags, headTags: [] });
  return `\`package.json\` is still ${mainVersion}, so merging releases v${version}. Bump it on \`dev\` for a minor or major release.`;
}

const git = (...args) => execFileSync("git", args, { encoding: "utf-8" });
const packageVersion = (ref) => JSON.parse(git("show", `${ref}:package.json`)).version;

if (import.meta.url === `file://${process.argv[1]}`) {
  const warning = versionBumpWarning({
    devVersion: packageVersion("origin/dev"),
    mainVersion: packageVersion("origin/main"),
    tags: git("tag", "--list", "v*").split("\n").filter(Boolean)
  });
  if (warning) console.log(warning);
}
