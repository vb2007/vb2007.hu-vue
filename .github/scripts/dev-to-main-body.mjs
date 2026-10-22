#!/usr/bin/env node
// Builds the description of the "Merge dev To main" PR: every PR merged into dev
// that main doesn't have yet, newest first, each with the issues it resolves.
//
//   - https://github.com/<repo>/pull/37
//     - Resolves: #36
//
// The PRs are the ones merged into dev whose merge (or head) commit is in
// origin/main..origin/dev. Reading the "Merge pull request #N" commits instead
// misses a PR stacked under another one and merged after it, since it gets no
// merge commit of its own. The issues come from the lines of each PR's body
// that start with a closing keyword (the PR rules in CLAUDE.md put them on
// `Resolves: #<issue>` lines), so a "close #51" in prose doesn't count.
//
// Writes the body to the file given as the first argument, and prints
// count / body_file, appending them to $GITHUB_OUTPUT when set. Needs `gh`
// authenticated through GH_TOKEN.
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const CLOSING_KEYWORD = /^\s*(?:[-*]\s+)?(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gim;

// pulls: the closed PRs into dev, as the REST API lists them. commits: the SHAs
// in origin/main..origin/dev.
export const unreleasedPrs = (pulls, commits) => {
  const unreleased = new Set(commits);
  return pulls
    .filter(
      (pr) => pr.merged_at && (unreleased.has(pr.merge_commit_sha) || unreleased.has(pr.head.sha))
    )
    .sort((a, b) => b.merged_at.localeCompare(a.merged_at));
};

export const resolvedIssues = (body) => [
  ...new Set([...body.matchAll(CLOSING_KEYWORD)].map((m) => Number(m[1])))
];

export const buildBody = (repoUrl, prs) =>
  prs
    .map(({ number, issues }) =>
      [`- ${repoUrl}/pull/${number}`, ...issues.map((i) => `  - Resolves: #${i}`)].join("\n")
    )
    .join("\n");

const run = (cmd, ...args) => execFileSync(cmd, args, { encoding: "utf-8" }).trim();

if (import.meta.url === `file://${process.argv[1]}`) {
  const bodyFile = process.argv[2];
  if (!bodyFile) throw new Error("Usage: dev-to-main-body.mjs <body-file>");

  const repo =
    process.env.GITHUB_REPOSITORY ??
    run("gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner");
  const commits = run("git", "rev-list", "origin/main..origin/dev").split("\n").filter(Boolean);
  const pulls = [];
  for (let page = 1; ; page++) {
    const batch = JSON.parse(
      run("gh", "api", `repos/${repo}/pulls?state=closed&base=dev&per_page=100&page=${page}`)
    );
    pulls.push(...batch);
    if (batch.length < 100) break;
  }
  const prs = unreleasedPrs(pulls, commits).map(({ number, body }) => ({
    number,
    issues: resolvedIssues(body ?? "")
  }));

  writeFileSync(bodyFile, buildBody(`https://github.com/${repo}`, prs) + "\n");

  const lines = [`count=${prs.length}`, `body_file=${bodyFile}`];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}
