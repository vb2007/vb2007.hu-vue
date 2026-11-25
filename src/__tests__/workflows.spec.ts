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
  source.match(new RegExp(`^["']?${key}["']?:.*(?:\\r?\\n(?:[ \\t#].*)?)*`, "m"))?.[0] ?? "";

const runsOnLines = (job: string): string[] =>
  (job.match(/^\s*runs-on:.*$/gm) ?? []).map((line) => line.trim());

const runsOnByJob = (source: string): Record<string, string[]> =>
  Object.fromEntries(
    topLevelSection(source, "jobs")
      .split(/^ {2}(?=[\w-]+:)/m)
      .slice(1)
      .map((job) => [job.split(":")[0], runsOnLines(job)])
  );

const pullRequestWorkflows = workflows.filter(({ source }) =>
  /\bpull_request/.test(topLevelSection(source, "on"))
);

describe("Workflows triggered by pull requests", () => {
  it("exist", () => {
    expect(pullRequestWorkflows.length).toBeGreaterThan(0);
  });

  it.each(pullRequestWorkflows)(
    "$file runs every job on the pr-worker runners only",
    ({ source }) => {
      const runsOn = runsOnByJob(source);
      const jobIds = Object.keys(runsOn);

      expect(jobIds.length).toBeGreaterThan(0);
      expect(runsOn).toEqual(Object.fromEntries(jobIds.map((id) => [id, prRunsOn])));
    }
  );
});
