import * as fs from "fs";
import * as crypto from "crypto";
import { GRAPH } from "./graph";
import type { PriorDataEntry, PriorDataFile } from "./types";
import { VALID_STATES } from "./states";

/** Deterministic hash of the current graph topology. */
export function computeGraphHash(): string {
  const canonical =
    GRAPH.nodes.sort().join(",") +
    "|" +
    GRAPH.edges
      .map(([a, b]) => `${a}->${b}`)
      .sort()
      .join(",");
  return crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

export const GRAPH_HASH = computeGraphHash();

/**
 * Load prior data from a JSON file. Returns null if the file doesn't exist,
 * is malformed, or was generated from a different graph topology.
 */
export function loadPriorData(filePath: string): PriorDataFile | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data: PriorDataFile = JSON.parse(raw);
    if (data.graphHash !== GRAPH_HASH) {
      console.log(
        `  Prior data graph mismatch (expected ${GRAPH_HASH}, got ${data.graphHash}). Using uniform prior.`
      );
      return null;
    }
    if (!Array.isArray(data.results) || data.results.length === 0) return null;
    return data;
  } catch {
    return null;
  }
}

/** Compute population prior by averaging posteriors from previous diagnostics. */
export function computePopulationPrior(
  data: PriorDataFile
): Record<string, number> {
  const stateIds = Object.keys(VALID_STATES);
  const avg: Record<string, number> = {};
  for (const s of stateIds) avg[s] = 0;

  let count = 0;
  for (const entry of data.results) {
    if (!entry.posterior) continue;
    for (const s of stateIds) {
      avg[s] += entry.posterior[s] ?? 0;
    }
    count++;
  }

  if (count === 0) return {};
  const total = Object.values(avg).reduce((a, b) => a + b, 0);
  for (const s of stateIds) avg[s] /= total;
  return avg;
}

/** Append a diagnostic result to the prior data file. */
export function saveDiagnosticResult(
  filePath: string,
  entry: PriorDataEntry
): void {
  let data: PriorDataFile;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    data = JSON.parse(raw);
    if (data.graphHash !== GRAPH_HASH) {
      data = { graphHash: GRAPH_HASH, results: [] };
    }
  } catch {
    data = { graphHash: GRAPH_HASH, results: [] };
  }
  data.results.push(entry);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export const DEFAULT_PRIOR_PATH = new URL("prior-data.json", `file://${process.cwd()}/`).pathname;
