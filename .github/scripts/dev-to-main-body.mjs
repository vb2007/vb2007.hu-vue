#!/usr/bin/env node
// Builds the description of the "Merge dev To main" PR: every PR merged into dev
// that main doesn't have yet, newest first, each with the issues it resolves.
//
//   - https://github.com/<repo>/pull/37
//     - Resolves: #36
//
// The PRs come from the merge commits in origin/main..origin/dev ("Merge pull
// request #N from ..."), the issues from the closing keywords in each PR's body
// (the PR rules in CLAUDE.md put them on `Resolves: #<issue>` lines).
//
// Writes the body to the file given as the first argument, and prints
// count / body_file, appending them to $GITHUB_OUTPUT when set. Needs `gh`
// authenticated through GH_TOKEN.
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

const MERGE_SUBJECT = /^Merge pull request #(\d+) /;
const CLOSING_KEYWORD = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+#(\d+)\b/gi;

export const prNumbers = (subjects) =>
  subjects.map((s) => MERGE_SUBJECT.exec(s)?.[1]).filter(Boolean).map(Number);

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

  const subjects = run("git", "log", "origin/main..origin/dev", "--merges", "--format=%s")
    .split("\n")
    .filter(Boolean);
  const prs = prNumbers(subjects).map((number) => ({
    number,
    issues: resolvedIssues(run("gh", "pr", "view", String(number), "--json", "body", "--jq", ".body"))
  }));

  const repo = process.env.GITHUB_REPOSITORY ?? run("gh", "repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner");
  writeFileSync(bodyFile, buildBody(`https://github.com/${repo}`, prs) + "\n");

  const lines = [`count=${prs.length}`, `body_file=${bodyFile}`];
  console.log(lines.join("\n"));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join("\n") + "\n");
}
