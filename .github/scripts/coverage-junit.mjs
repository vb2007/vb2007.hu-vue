#!/usr/bin/env node
/**
 * Vitest coverage summary -> synthetic JUnit XML.
 *
 * Vitest enforces the coverage thresholds itself (vitest.config.ts), but a
 * threshold failure only shows up in the unit-tests step log - its JUnit
 * output lists test cases, not coverage. This turns coverage-summary.json
 * (from the json-summary coverage reporter) into one test case per metric,
 * so coverage becomes its own "coverage" stage in junit-report.mjs's
 * HTML/ODS/markdown reports and in the check-run annotations, the same way
 * ci.yml hand-writes JUnit for the typecheck/lint/build stages.
 *
 * Usage:
 *   node coverage-junit.mjs --summary <coverage-summary.json> --threshold <pct> --out <file.xml>
 *
 * --threshold should match the thresholds in vitest.config.ts (ci.yml passes
 * 100). A missing summary - vitest crashed before writing coverage - becomes
 * a single failed case instead of an error, so the stage still reports.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const METRICS = ["lines", "branches", "functions", "statements"];

function parseArgs(argv) {
  const args = { summary: null, threshold: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--summary") args.summary = argv[++i];
    else if (argv[i] === "--threshold") args.threshold = Number(argv[++i]);
    else if (argv[i] === "--out") args.out = argv[++i];
  }
  if (!args.summary || !args.out || !Number.isFinite(args.threshold)) {
    console.error(
      "Usage: node coverage-junit.mjs --summary <coverage-summary.json> --threshold <pct> --out <file.xml>"
    );
    process.exit(1);
  }
  return args;
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCases(summaryPath, threshold) {
  if (!existsSync(summaryPath)) {
    return [
      {
        name: "coverage summary was written",
        failure: `${summaryPath} not found - see the Run unit tests step log`
      }
    ];
  }
  const { total } = JSON.parse(readFileSync(summaryPath, "utf-8"));
  return METRICS.map((metric) => {
    const { pct, covered, total: count } = total[metric];
    const name = `${metric}: ${pct}% (${covered}/${count}), threshold ${threshold}%`;
    return {
      name,
      failure: pct < threshold ? `${metric} coverage ${pct}% is below the ${threshold}% threshold` : null
    };
  });
}

function main() {
  const { summary, threshold, out } = parseArgs(process.argv.slice(2));
  const cases = buildCases(summary, threshold);
  const failures = cases.filter((c) => c.failure).length;

  const testcases = cases
    .map((c) => {
      const failure = c.failure
        ? `<failure message="${escapeXml(c.failure)}">${escapeXml(c.failure)}</failure>`
        : "";
      return `    <testcase classname="coverage" name="${escapeXml(c.name)}" time="0">${failure}</testcase>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="coverage" tests="${cases.length}" failures="${failures}" time="0">
  <testsuite name="coverage" tests="${cases.length}" failures="${failures}" time="0">
${testcases}
  </testsuite>
</testsuites>
`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, xml);
  console.log(xml);
}

main();
