// Second-process read of one durable run. Prints the stored row as JSON.
import { openRunStore, readRun } from "./sqliteRunStore.mjs";

const filePath = process.argv[2];
const runId = process.argv[3];
if (!filePath || !runId) {
  console.error("usage: node local/readRunCli.mjs <db> <run-id>");
  process.exit(2);
}
const db = openRunStore(filePath);
const row = readRun(db, runId);
if (!row) {
  console.error("missing run");
  process.exit(1);
}
process.stdout.write(JSON.stringify(row));
