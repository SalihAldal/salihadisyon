import { readFileSync, writeFileSync } from "node:fs";

const DOC_PATH = new URL("../docs/ALDAL-POS-UI-MIGRATION.md", import.meta.url);

const AUTO_START = "<!-- AUTO_SUMMARY_START -->";
const AUTO_END = "<!-- AUTO_SUMMARY_END -->";

function isHeaderRow(cells) {
  return cells.includes("MODULE") && cells.includes("STATUS");
}

function isSeparatorRow(line) {
  return /^\|\s*-{3,}\s*\|/.test(line.trim());
}

function splitRow(line) {
  const raw = line.trim();
  if (!raw.startsWith("|")) return null;
  const parts = raw
    .split("|")
    .slice(1, -1)
    .map((p) => p.trim());
  return parts.length ? parts : null;
}

function pickLastIndex(cells, valueSet) {
  for (let i = cells.length - 1; i >= 0; i--) {
    if (valueSet.has(cells[i])) return i;
  }
  return -1;
}

function computeCounts(rows) {
  const statusSet = new Set(["PENDING", "IN PROGRESS", "COMPLETED", "BLOCKED"]);
  const matchSet = new Set(["HIGH", "MEDIUM", "LOW", "UNKNOWN"]);

  const counts = {
    total: rows.length,
    completed: 0,
    inProgress: 0,
    pending: 0,
    blocked: 0,
    high: 0,
    medium: 0,
    low: 0,
    unknown: 0,
    legacyRemaining: 0,
  };

  for (const cells of rows) {
    const statusIdx = pickLastIndex(cells, statusSet);
    const matchIdx = pickLastIndex(cells, matchSet);
    const status = statusIdx >= 0 ? cells[statusIdx] : "PENDING";
    const match = matchIdx >= 0 ? cells[matchIdx] : "UNKNOWN";

    if (status === "COMPLETED") counts.completed += 1;
    else if (status === "IN PROGRESS") counts.inProgress += 1;
    else if (status === "BLOCKED") counts.blocked += 1;
    else counts.pending += 1;

    if (match === "HIGH") counts.high += 1;
    else if (match === "MEDIUM") counts.medium += 1;
    else if (match === "LOW") counts.low += 1;
    else counts.unknown += 1;
  }

  counts.legacyRemaining = counts.total - counts.completed;
  return counts;
}

function formatSummary(counts) {
  return [
    "",
    "- **TOTAL DISCOVERED SCREENS**: " + counts.total,
    "- **COMPLETED**: " + counts.completed,
    "- **IN PROGRESS**: " + counts.inProgress,
    "- **PENDING**: " + counts.pending,
    "- **BLOCKED**: " + counts.blocked,
    "",
    "- **HIGH MATCH**: " + counts.high,
    "- **MEDIUM MATCH**: " + counts.medium,
    "- **LOW MATCH**: " + counts.low,
    "- **UNKNOWN MATCH**: " + counts.unknown,
    "",
    "- **LEGACY UI REMAINING**: " + counts.legacyRemaining,
    "",
  ].join("\n");
}

function main() {
  const doc = readFileSync(DOC_PATH, "utf8");
  const lines = doc.split(/\r?\n/);

  const inventoryRows = [];
  for (const line of lines) {
    if (!line.trim().startsWith("|")) continue;
    if (isSeparatorRow(line)) continue;
    const cells = splitRow(line);
    if (!cells) continue;
    if (isHeaderRow(cells)) continue;
    // Heuristic: treat as an inventory row only if it ends with a known STATUS.
    const last = cells[cells.length - 1];
    if (["PENDING", "IN PROGRESS", "COMPLETED", "BLOCKED"].includes(last)) {
      inventoryRows.push(cells);
    }
  }

  const counts = computeCounts(inventoryRows);
  const startIdx = lines.findIndex((l) => l.includes(AUTO_START));
  const endIdx = lines.findIndex((l) => l.includes(AUTO_END));
  if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) {
    throw new Error("AUTO summary markers not found or invalid in docs/ALDAL-POS-UI-MIGRATION.md");
  }

  const nextLines = [
    ...lines.slice(0, startIdx + 1),
    ...formatSummary(counts).split("\n"),
    ...lines.slice(endIdx),
  ];

  writeFileSync(DOC_PATH, nextLines.join("\n"));
}

main();

