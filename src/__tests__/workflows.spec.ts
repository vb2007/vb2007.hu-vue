import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// PR code must never reach the `prod` runner (vbServer). The runner's job-started hook
// (.github/runner/host-job-guard.sh) refuses it; this catches a wrong pin in the PR itself.
interface Workflow {
  file: string;
  source: string;
}

const prRunsOn = ["runs-on: [self-hosted, Linux, X64, pr-worker]"];

const workflowDir = join(dirname(fileURLToPath(import.meta.url)), "../../.github/workflows");

const workflows: Workflow[] = readdirSync(workflowDir)
  .filter((file) => /\.ya?ml$/.test(file))
  .map((file) => ({ file, source: readFileSync(join(workflowDir, file), "utf8") }));

// A top-level key's block: its line plus every following indented, blank or comment line.
const topLevelSection = (source: string, key: string): string =>
  source.match(new RegExp(`^["']?${key}["']?[ \\t]*:.*(?:\\r?\\n(?:[ \\t#].*)?)*`, "m"))?.[0] ?? "";

const runsOnLines = (job: string): string[] =>
  (job.match(/^\s*runs-on:.*$/gm) ?? []).map((line) => line.trim());

// Anything under `jobs:` that isn't a job, a comment or blank is kept under "(not a job)", so it fails.
const runsOnByJob = (source: string): Record<string, string[]> => {
  const [head, ...jobs] = topLevelSection(source, "jobs").split(/^ {2}(?=["']?[\w-]+["']?\s*:)/m);
  const notJobs = head
    .split(/\r?\n/)
    .slice(1)
    .filter((line) => !/^\s*(#.*)?$/.test(line));
  return Object.fromEntries([
    ...jobs.map((job) => [/[\w-]+/.exec(job)?.[0] ?? job, runsOnLines(job)]),
    ...(notJobs.length ? [["(not a job)", notJobs]] : [])
  ]);
};

// Not triggered by PRs, but the guard allows push on dev, so only this keeps them off `prod`.
const prWorkerWorkflows = ["dev-to-main-pr.yml"];

const pullRequestWorkflows = workflows.filter(({ source }) =>
  /\bpull_request/.test(topLevelSection(source, "on"))
);

const checkedWorkflows = workflows.filter(
  (workflow) => pullRequestWorkflows.includes(workflow) || prWorkerWorkflows.includes(workflow.file)
);

describe("Workflows that must stay on the pr-worker runners", () => {
  it("exist", () => {
    expect(pullRequestWorkflows.length).toBeGreaterThan(0);
    expect(checkedWorkflows.map(({ file }) => file)).toEqual(
      expect.arrayContaining(prWorkerWorkflows)
    );
  });

  it.each(checkedWorkflows)("$file runs every job on the pr-worker runners only", ({ source }) => {
    const runsOn = runsOnByJob(source);
    const jobIds = Object.keys(runsOn);

    expect(jobIds.length).toBeGreaterThan(0);
    expect(runsOn).toEqual(Object.fromEntries(jobIds.map((id) => [id, prRunsOn])));
  });
});
