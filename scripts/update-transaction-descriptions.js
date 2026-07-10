#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const transactionTools = require("../src/tools/transactions.js");

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) throw new Error("Usage: update-transaction-descriptions.js <updates.json>");
  const updates = JSON.parse(fs.readFileSync(path.resolve(inputPath), "utf8"));
  if (!Array.isArray(updates)) throw new Error("Update file must contain a JSON array");
  const updateTransaction = transactionTools.find(tool => tool.name === "update_transaction");
  if (!updateTransaction) throw new Error("update_transaction tool is unavailable");

  const results = [];
  for (const update of updates) {
    if (!update || !update.id || !update.description) throw new Error("Each update requires id and description");
    const verified = await updateTransaction.handler({ id: String(update.id), description: String(update.description) });
    const transaction = verified?.data?.attributes?.transactions?.[0];
    results.push({
      id: String(update.id),
      description: transaction?.description || null,
      verified: transaction?.description === String(update.description)
    });
  }
  const failed = results.filter(result => !result.verified);
  process.stdout.write(`${JSON.stringify({ updated_count: results.length - failed.length, failed_count: failed.length, results }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
