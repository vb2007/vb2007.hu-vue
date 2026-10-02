#!/usr/bin/env node
/**
 * JUnit XML -> HTML + ODS (+ markdown/JSON summary) report generator.
 *
 * Vitest and Playwright both emit standard JUnit XML through their built-in
 * junit reporters, the typecheck/lint/build stages emit small hand-written
 * ones (see ci.yml) and the coverage gate gets one from coverage-junit.mjs, so
 * every stage feeds this single converter instead of each test runner
 * needing its own HTML/ODS reporter dependency.
 *
 * Usage:
 *   node junit-report.mjs --input <dir> --out <dir> [--suffix <value>]
 *
 * --input is scanned recursively for *.xml files. Each file's own basename
 * is used as the stage label when it looks like junit-<stage>.xml (this
 * matches how ci.yml names the uploaded artifacts: junit-typecheck-<run>.xml,
 * junit-unit-tests-<run>.xml, junit-e2e-<run>.xml -> stages "typecheck",
 * "unit-tests", "e2e"); falling back to the parent directory name
 * for any other layout (e.g. a zipped multi-file artifact extracted into
 * its own subdirectory).
 *
 * --suffix, when given, is appended (as -<suffix>) to every output
 * filename - ci.yml passes the run number, so repeated downloads across
 * different runs never collide on a filesystem.
 *
 * Writes, into --out:
 *   report[-suffix].html   - self-contained styled report, per-stage sections
 *   report[-suffix].ods    - real OpenDocument spreadsheet: a Summary sheet
 *                            plus one sheet per stage with its own test cases
 *   summary[-suffix].json  - { stages: [...], totals: {...} } for other steps to reuse
 *   summary[-suffix].md    - markdown table, ready to paste into a step summary or PR comment
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename, dirname } from "node:path";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";

function parseArgs(argv) {
  const args = { input: null, out: null, suffix: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input") args.input = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--suffix") args.suffix = argv[++i];
  }
  if (!args.input || !args.out) {
    console.error("Usage: node junit-report.mjs --input <dir> --out <dir> [--suffix <value>]");
    process.exit(1);
  }
  return args;
}

function findXmlFiles(dir) {
  const found = [];
  const walk = (d) => {
    // download-artifact never creates --input's directory at all when zero
    // artifacts matched the pattern (e.g. every upstream stage failed or
    // was cancelled before it could upload) - that's a legitimate "no
    // results yet" case, not an error, so degrade to an empty report
    // instead of crashing the whole reports/summary pipeline over it.
    let entries;
    try {
      entries = readdirSync(d);
    } catch (err) {
      if (err.code === "ENOENT") return;
      throw err;
    }
    for (const entry of entries) {
      const full = join(d, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (entry.toLowerCase().endsWith(".xml")) found.push(full);
    }
  };
  walk(dir);
  return found;
}

function stageNameFor(xmlPath) {
  // Each stage now uploads as its own direct (unzipped) artifact named
  // junit-<stage>-<run_number>.xml (see ci.yml), so derive the stage from
  // the filename itself, stripping both the junit- prefix and the trailing
  // -<run_number>. Falls back to a directory-based convention too, in case
  // download-artifact ever nests a direct artifact under a subdirectory
  // named after it.
  const base = basename(xmlPath, ".xml");
  if (base.startsWith("junit-")) return base.slice("junit-".length).replace(/-\d+$/, "");
  const dir = basename(dirname(xmlPath));
  return dir.replace(/^junit-/, "") || base;
}

// Normalizes a parsed <testsuite> (or the sole child of <testsuites>) into a
// flat list of test cases, tolerating Vitest's and Playwright's slightly
// different attribute shapes and the single-child-not-an-array quirk of
// fast-xml-parser when an element appears exactly once.
function asArray(x) {
  if (x === undefined || x === null) return [];
  return Array.isArray(x) ? x : [x];
}

function num(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function extractCases(suite) {
  return asArray(suite.testcase).map((tc) => {
    const attrs = tc;
    let status = "passed";
    let failureMessage = null;
    if (attrs.failure !== undefined) {
      status = "failed";
      const f = Array.isArray(attrs.failure) ? attrs.failure[0] : attrs.failure;
      failureMessage =
        (typeof f === "object" ? f["@_message"] || f["#text"] : String(f)) || "Test failed";
    } else if (attrs.error !== undefined) {
      status = "failed";
      const e = Array.isArray(attrs.error) ? attrs.error[0] : attrs.error;
      failureMessage =
        (typeof e === "object" ? e["@_message"] || e["#text"] : String(e)) || "Test errored";
    } else if (attrs.skipped !== undefined) {
      status = "skipped";
    }
    return {
      classname: attrs["@_classname"] || "",
      name: attrs["@_name"] || "(unnamed test)",
      time: num(attrs["@_time"]),
      status,
      failureMessage
    };
  });
}

function parseJUnitFile(xmlPath, stage) {
  const xml = readFileSync(xmlPath, "utf-8");
  const parser = new XMLParser({
    ignoreAttributes: false,
    textNodeName: "#text",
    // fast-xml-parser's boolean `processEntities: true` pins
    // maxTotalExpansions to 1000, but that counter tallies *every*
    // predefined entity occurrence in the document (e.g. &quot; inside a
    // test name), not just DOCTYPE entity expansions - so it caps document
    // size, not attack surface, and a large suite can cross it on ordinary
    // quoted assertion text alone. The object form is spelled out in full
    // because its own defaults are *looser* than the boolean form's
    // (maxExpansionDepth 10000, maxTotalExpansions Infinity); these values
    // restate the strict boolean profile and widen only the size-scaling
    // counter. maxExpandedLength is what actually stops entity-inflation
    // ("billion laughs") payloads, and stays unchanged.
    processEntities: {
      enabled: true,
      maxEntitySize: 10000,
      maxExpansionDepth: 10,
      maxExpandedLength: 100000,
      maxEntityCount: 1000,
      maxTotalExpansions: 1000000
    },
    htmlEntities: true
  });
  const doc = parser.parse(xml);

  const root = doc.testsuites ?? doc.testsuite;
  if (!root) {
    return { stage, tests: 0, failures: 0, skipped: 0, time: 0, cases: [] };
  }
  const suites = doc.testsuites ? asArray(doc.testsuites.testsuite) : [doc.testsuite];

  let tests = 0;
  let failures = 0;
  let skipped = 0;
  let time = 0;
  const cases = [];

  for (const suite of suites) {
    if (!suite) continue;
    tests += num(suite["@_tests"]);
    failures += num(suite["@_failures"]) + num(suite["@_errors"]);
    skipped += num(suite["@_skipped"]);
    time += num(suite["@_time"]);
    cases.push(...extractCases(suite));
  }

  // Some runners only set suite-level counters without matching testcase
  // counts (or vice versa); recompute from cases when they disagree so the
  // displayed totals are always internally consistent.
  if (cases.length > 0) {
    tests = cases.length;
    failures = cases.filter((c) => c.status === "failed").length;
    skipped = cases.filter((c) => c.status === "skipped").length;
  }

  return { stage, tests, failures, skipped, time, cases };
}

// A single malformed/unparseable JUnit file (e.g. truncated by a runner
// crash, or tripping fast-xml-parser's entity-inflation guards) used to abort
// `main`'s whole `.map(parseJUnitFile)` and take report generation down with
// it - which meant a run where every test job actually passed could still
// end up with no HTML/ODS/summary artifacts at all, and no clue why. Degrade
// instead: log it and surface it as one synthetic failed case so the stage
// still shows up (as failed) in every output, and every *other* stage's
// results still get reported.
function safeParseJUnitFile(xmlPath, stage) {
  try {
    return parseJUnitFile(xmlPath, stage);
  } catch (err) {
    console.error(`Could not parse ${basename(xmlPath)}: ${err.message}`);
    return {
      stage,
      tests: 1,
      failures: 1,
      skipped: 0,
      time: 0,
      cases: [
        {
          classname: "",
          name: "(report generation)",
          time: 0,
          status: "failed",
          failureMessage: `Could not parse ${basename(xmlPath)}: ${err.message}`
        }
      ]
    };
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildHtml(stages, totals) {
  const stageRows = stages
    .map(
      (s) => `
        <tr class="${s.failures > 0 ? "row-fail" : "row-pass"}">
          <td>${escapeHtml(s.stage)}</td>
          <td>${s.tests}</td>
          <td>${s.tests - s.failures - s.skipped}</td>
          <td>${s.failures}</td>
          <td>${s.skipped}</td>
          <td>${s.time.toFixed(2)}s</td>
        </tr>`
    )
    .join("");

  const detailSections = stages
    .map((s) => {
      const failedCases = s.cases.filter((c) => c.status === "failed");
      const caseRows = s.cases
        .map(
          (c) => `
        <tr class="case-${c.status}">
          <td>${escapeHtml(c.classname)}</td>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.status}</td>
          <td>${c.time.toFixed(3)}s</td>
        </tr>`
        )
        .join("");
      const failureDetails = failedCases
        .map(
          (c) => `
        <div class="failure">
          <strong>${escapeHtml(c.classname)} &rsaquo; ${escapeHtml(c.name)}</strong>
          <pre>${escapeHtml(c.failureMessage ?? "")}</pre>
        </div>`
        )
        .join("");
      return `
      <section>
        <h2>${escapeHtml(s.stage)} <span class="badge ${s.failures > 0 ? "badge-fail" : "badge-pass"}">${
          s.failures > 0 ? `${s.failures} failed` : "all passed"
        }</span></h2>
        <table class="cases">
          <thead><tr><th>Class</th><th>Test</th><th>Status</th><th>Time</th></tr></thead>
          <tbody>${caseRows}</tbody>
        </table>
        ${failureDetails ? `<div class="failures">${failureDetails}</div>` : ""}
      </section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>vb2007.hu test report</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  h1 { margin-bottom: 0.25rem; }
  .meta { color: #666; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1rem; background: #fff; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.92rem; }
  th { background: #f0f0f0; }
  .row-fail { background: #fff3f3; }
  .row-pass { background: #f3fff5; }
  .case-failed { background: #fff3f3; }
  .case-skipped { background: #fffbe6; }
  .badge { font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px; margin-left: 0.5rem; }
  .badge-pass { background: #d7f5df; color: #14532d; }
  .badge-fail { background: #fbd5d5; color: #7f1d1d; }
  .failures { margin-top: 0.5rem; }
  .failure { background: #fff5f5; border: 1px solid #f3caca; border-radius: 6px; padding: 0.5rem 0.75rem; margin-bottom: 0.5rem; }
  .failure pre { white-space: pre-wrap; word-break: break-word; margin: 0.4rem 0 0; font-size: 0.85rem; }
  section { margin-bottom: 2rem; }
</style>
</head>
<body>
  <h1>vb2007.hu test report</h1>
  <p class="meta">Generated ${new Date().toISOString()}</p>
  <table>
    <thead><tr><th>Stage</th><th>Total</th><th>Passed</th><th>Failed</th><th>Skipped</th><th>Duration</th></tr></thead>
    <tbody>${stageRows}
      <tr><td><strong>Total</strong></td><td>${totals.tests}</td><td>${
        totals.tests - totals.failures - totals.skipped
      }</td><td>${totals.failures}</td><td>${totals.skipped}</td><td>${totals.time.toFixed(2)}s</td></tr>
    </tbody>
  </table>
  ${detailSections}
</body>
</html>`;
}

// ---- ODS generation -------------------------------------------------------
// An .ods is a zip with a mimetype file (stored uncompressed, first entry),
// META-INF/manifest.xml, and content.xml (+ minimal styles.xml). We build a
// two-sheet spreadsheet by hand rather than pulling in a full ODS library.

function odsCell(value, type = "string") {
  if (type === "float") {
    return `<table:table-cell office:value-type="float" office:value="${value}"><text:p>${escapeHtml(
      value
    )}</text:p></table:table-cell>`;
  }
  return `<table:table-cell office:value-type="string"><text:p>${escapeHtml(value)}</text:p></table:table-cell>`;
}

function odsRow(cells) {
  return `<table:table-row>${cells.join("")}</table:table-row>`;
}

// ODF (and Excel) sheet names can't contain \ / ? * [ ] : , must be
// non-empty, and are conventionally capped at 31 characters - stage names
// come from this repo's own CI job names so collisions aren't expected in
// practice, but sanitizing defensively costs nothing.
function sanitizeSheetName(name, usedNames) {
  let clean = String(name).replace(/[\\/?*[\]:]/g, "_").slice(0, 31) || "stage";
  let candidate = clean;
  let i = 2;
  while (usedNames.has(candidate)) {
    const marker = `_${i}`;
    candidate = clean.slice(0, 31 - marker.length) + marker;
    i++;
  }
  usedNames.add(candidate);
  return candidate;
}

function buildContentXml(stages, totals) {
  const summaryHeader = odsRow(
    ["Stage", "Total", "Passed", "Failed", "Skipped", "Duration (s)"].map((h) => odsCell(h))
  );
  const summaryRows = stages
    .map((s) =>
      odsRow([
        odsCell(s.stage),
        odsCell(s.tests, "float"),
        odsCell(s.tests - s.failures - s.skipped, "float"),
        odsCell(s.failures, "float"),
        odsCell(s.skipped, "float"),
        odsCell(s.time.toFixed(2), "float")
      ])
    )
    .join("");
  const summaryTotal = odsRow([
    odsCell("Total"),
    odsCell(totals.tests, "float"),
    odsCell(totals.tests - totals.failures - totals.skipped, "float"),
    odsCell(totals.failures, "float"),
    odsCell(totals.skipped, "float"),
    odsCell(totals.time.toFixed(2), "float")
  ]);

  // One sheet per stage (rather than one combined "Tests" sheet with a
  // Stage column) so each stage's results can be opened,
  // filtered and read on their own.
  const usedSheetNames = new Set(["Summary"]);
  const stageSheets = stages
    .map((s) => {
      const sheetName = sanitizeSheetName(s.stage, usedSheetNames);
      const header = odsRow(
        ["Class", "Test", "Status", "Duration (s)", "Failure message"].map((h) => odsCell(h))
      );
      const rows = s.cases
        .map((c) =>
          odsRow([
            odsCell(c.classname),
            odsCell(c.name),
            odsCell(c.status),
            odsCell(c.time.toFixed(3), "float"),
            odsCell(c.failureMessage ?? "")
          ])
        )
        .join("");
      return `<table:table table:name="${escapeHtml(sheetName)}">${header}${rows}</table:table>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  office:version="1.2">
  <office:body>
    <office:spreadsheet>
      <table:table table:name="Summary">
        ${summaryHeader}
        ${summaryRows}
        ${summaryTotal}
      </table:table>
      ${stageSheets}
    </office:spreadsheet>
  </office:body>
</office:document-content>`;
}

const MANIFEST_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
  <manifest:file-entry manifest:full-path="/" manifest:version="1.2" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
  <manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
  <manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`;

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" office:version="1.2">
  <office:styles/>
</office:document-styles>`;

async function buildOds(stages, totals) {
  const zip = new JSZip();
  // mimetype MUST be the first entry and stored (uncompressed) for the file
  // to be recognized as a valid ODF package by readers that sniff it.
  zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet", {
    compression: "STORE"
  });
  zip.folder("META-INF").file("manifest.xml", MANIFEST_XML);
  zip.file("content.xml", buildContentXml(stages, totals));
  zip.file("styles.xml", STYLES_XML);
  return zip.generateAsync({ type: "nodebuffer", mimeType: "application/vnd.oasis.opendocument.spreadsheet" });
}

function buildMarkdown(stages, totals) {
  const lines = [
    "| Stage | Total | Passed | Failed | Skipped | Duration |",
    "|---|---|---|---|---|---|"
  ];
  for (const s of stages) {
    const icon = s.failures > 0 ? "❌" : "✅";
    lines.push(
      `| ${icon} ${s.stage} | ${s.tests} | ${s.tests - s.failures - s.skipped} | ${s.failures} | ${s.skipped} | ${s.time.toFixed(2)}s |`
    );
  }
  lines.push(
    `| **Total** | **${totals.tests}** | **${totals.tests - totals.failures - totals.skipped}** | **${totals.failures}** | **${totals.skipped}** | **${totals.time.toFixed(2)}s** |`
  );
  return lines.join("\n") + "\n";
}

async function main() {
  const { input, out, suffix } = parseArgs(process.argv.slice(2));
  const tag = suffix ? `-${suffix}` : "";
  mkdirSync(out, { recursive: true });

  const xmlFiles = findXmlFiles(input);
  if (xmlFiles.length === 0) {
    console.error(`No .xml files found under ${input}`);
  }

  const stages = xmlFiles
    .map((f) => safeParseJUnitFile(f, stageNameFor(f)))
    .sort((a, b) => a.stage.localeCompare(b.stage));

  const totals = stages.reduce(
    (acc, s) => ({
      tests: acc.tests + s.tests,
      failures: acc.failures + s.failures,
      skipped: acc.skipped + s.skipped,
      time: acc.time + s.time
    }),
    { tests: 0, failures: 0, skipped: 0, time: 0 }
  );

  writeFileSync(join(out, `report${tag}.html`), buildHtml(stages, totals));
  writeFileSync(join(out, `report${tag}.ods`), await buildOds(stages, totals));
  writeFileSync(
    join(out, `summary${tag}.json`),
    JSON.stringify({ stages, totals, generatedAt: new Date().toISOString() }, null, 2)
  );
  writeFileSync(join(out, `summary${tag}.md`), buildMarkdown(stages, totals));

  console.log(`Processed ${xmlFiles.length} JUnit file(s) across ${stages.length} stage(s).`);
  console.log(`Total: ${totals.tests} tests, ${totals.failures} failed, ${totals.skipped} skipped.`);

  if (totals.failures > 0) {
    // Non-fatal: the reports job should still upload artifacts and publish
    // the summary even when tests failed. The workflow gates on the actual
    // test jobs' own exit codes, not on this script's.
    console.log("Note: report reflects failing test(s) from upstream job(s).");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
