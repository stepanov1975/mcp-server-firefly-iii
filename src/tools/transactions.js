const { apiClient } = require("../config.js");

const DEFAULT_REVIEW_REMOVE_TAGS = [
  "needs-review",
  "needs-investigation",
  "needs-initial-review",
  "amount-change",
  "new-merchant",
  "foreign-new-merchant",
  "high-value-new-merchant",
  "duplicate-looking",
  "fee-or-interest"
];
const DEFAULT_REVIEW_REMOVE_PREFIXES = ["risk-", "notify-"];
const DEFAULT_REVIEW_ADD_TAGS = ["reviewed", "cleared-by-alex"];

function uniqueStrings(items) {
  const result = [];
  for (const item of items || []) {
    if (item === null || item === undefined || item === "") continue;
    const value = String(item);
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

function dateOnly(value) {
  if (!value) return null;
  return String(value).split("T", 1)[0];
}

function parseNotes(notes) {
  if (typeof notes !== "string" || !notes.trim().startsWith("{")) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function firstTransaction(payload) {
  const transactions = payload?.data?.attributes?.transactions;
  if (!Array.isArray(transactions) || transactions.length === 0 || typeof transactions[0] !== "object") {
    throw new Error("Firefly transaction payload did not contain a transaction row");
  }
  return transactions[0];
}

function compactRowsFromPayload(payload, { includeNotes = false } = {}) {
  const groups = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
  const rows = [];
  for (const group of groups) {
    const transactions = group?.attributes?.transactions;
    if (!Array.isArray(transactions)) continue;
    for (const tx of transactions) {
      const notes = parseNotes(tx.notes);
      const row = {
        group_id: group.id ? String(group.id) : null,
        transaction_journal_id: tx.transaction_journal_id ? String(tx.transaction_journal_id) : null,
        type: tx.type || null,
        date: dateOnly(tx.date),
        amount: tx.amount ? String(tx.amount) : null,
        description: tx.description || null,
        source_name: tx.source_name || null,
        destination_name: tx.destination_name || null,
        category_name: tx.category_name || null,
        tags: Array.isArray(tx.tags) ? tx.tags.map(String) : [],
        external_id: tx.external_id || null,
        statement_row_id: notes.statement_row_id || null,
        source_document_id: notes.source_document_id || null,
        statement_date: notes.statement_date || null,
        issuer: notes.issuer || null,
        card_last4: notes.card_last4 || null
      };
      if (includeNotes) row.notes = tx.notes || null;
      rows.push(row);
    }
  }
  return rows;
}

function sameText(left, right) {
  return String(left || "").trim().toLocaleLowerCase() === String(right || "").trim().toLocaleLowerCase();
}

function filterCompactRows(rows, args) {
  const externalIds = new Set(uniqueStrings(args.external_ids));
  const requiredTags = uniqueStrings(args.tags);
  return rows.filter(row => {
    if (externalIds.size && !externalIds.has(String(row.external_id || ""))) return false;
    if (args.source_document_id && String(row.source_document_id || "") !== String(args.source_document_id)) return false;
    if (args.statement_date && String(row.statement_date || "") !== String(args.statement_date)) return false;
    if (args.source_name && !sameText(row.source_name, args.source_name)) return false;
    if (args.destination_name && !sameText(row.destination_name, args.destination_name)) return false;
    if (args.start && row.date && row.date < args.start) return false;
    if (args.end && row.date && row.date > args.end) return false;
    if (requiredTags.length && !requiredTags.every(tag => row.tags.includes(tag))) return false;
    return true;
  });
}

async function getTransactionsCompact(args) {
  const includeNotes = Boolean(args.include_notes);
  const ids = uniqueStrings(args.ids);
  let rows = [];
  if (ids.length) {
    for (const id of ids) {
      const payload = (await apiClient.get(`/transactions/${id}`)).data;
      rows.push(...compactRowsFromPayload(payload, { includeNotes }));
    }
  } else {
    const limit = Number(args.limit || 100);
    const maxPages = Number(args.max_pages || 10);
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages && page <= maxPages) {
      const params = { limit, page };
      if (args.start) params.start = args.start;
      if (args.end) params.end = args.end;
      if (args.type) params.type = args.type;
      const payload = (await apiClient.get("/transactions", { params })).data;
      rows.push(...compactRowsFromPayload(payload, { includeNotes }));
      const pagination = payload?.meta?.pagination || {};
      totalPages = Number(pagination.total_pages || pagination.totalPages || page);
      page += 1;
    }
  }
  const filtered = filterCompactRows(rows, args);
  return { count: filtered.length, transactions: filtered };
}

function matchesPattern(tag, pattern) {
  const value = String(pattern);
  if (value.endsWith("*")) return tag.startsWith(value.slice(0, -1));
  return tag === value;
}

function tagShouldBePreserved(tag, preserveTags) {
  return preserveTags.some(pattern => matchesPattern(tag, pattern));
}

function tagShouldBeRemoved(tag, removeTags, removePrefixes) {
  return removeTags.includes(tag) || removePrefixes.some(prefix => tag.startsWith(prefix));
}

function tagsAfterUpdate(beforeTags, args) {
  const removeTags = uniqueStrings(args.remove_tags);
  const removePrefixes = uniqueStrings(args.remove_prefixes);
  const preserveTags = uniqueStrings(args.preserve_tags);
  const addTags = uniqueStrings(args.add_tags);
  const nextTags = beforeTags.filter(tag => tagShouldBePreserved(tag, preserveTags) || !tagShouldBeRemoved(tag, removeTags, removePrefixes));
  for (const tag of addTags) {
    if (!nextTags.includes(tag)) nextTags.push(tag);
  }
  return nextTags;
}

function transactionPayloadWithTags(transaction, tags) {
  const payloadRow = {
    transaction_journal_id: transaction.transaction_journal_id,
    type: transaction.type,
    date: dateOnly(transaction.date),
    amount: String(transaction.amount || "0"),
    description: transaction.description,
    source_name: transaction.source_name,
    destination_name: transaction.destination_name,
    tags,
    notes: transaction.notes || "",
    external_id: transaction.external_id || null
  };
  if (transaction.category_name) payloadRow.category_name = transaction.category_name;
  return { apply_rules: false, fire_webhooks: false, transactions: [payloadRow] };
}

async function updateTransactionTagsVerified(args) {
  const transactionId = args.transaction_id || args.id;
  if (!transactionId) throw new Error("transaction_id is required");
  const removeTags = uniqueStrings(args.remove_tags);
  const removePrefixes = uniqueStrings(args.remove_prefixes);
  const current = (await apiClient.get(`/transactions/${transactionId}`)).data;
  const transaction = firstTransaction(current);
  const beforeTags = uniqueStrings(transaction.tags || []);
  const expectedTags = tagsAfterUpdate(beforeTags, args);
  if (args.dry_run) {
    return {
      transaction_id: String(transactionId),
      status: "dry-run",
      before_tags: beforeTags,
      expected_tags: expectedTags,
      active_review_tags_left: []
    };
  }
  await apiClient.put(`/transactions/${transactionId}`, transactionPayloadWithTags(transaction, expectedTags));
  const verified = (await apiClient.get(`/transactions/${transactionId}`)).data;
  const verifiedTags = uniqueStrings(firstTransaction(verified).tags || []);
  const missingExpectedTags = expectedTags.filter(tag => !verifiedTags.includes(tag));
  const activeReviewTagsLeft = verifiedTags.filter(tag => tagShouldBeRemoved(tag, removeTags, removePrefixes));
  const ok = missingExpectedTags.length === 0 && activeReviewTagsLeft.length === 0;
  return {
    transaction_id: String(transactionId),
    status: ok ? "updated" : "verification-failed",
    before_tags: beforeTags,
    expected_tags: expectedTags,
    after_tags: verifiedTags,
    active_review_tags_left: activeReviewTagsLeft,
    missing_expected_tags: missingExpectedTags
  };
}

async function applyReviewDecisions(args) {
  const decisions = args.decisions || args;
  const items = decisions.suspicious_transactions || decisions.decisions;
  if (!Array.isArray(items)) throw new Error("decisions must contain suspicious_transactions or decisions");
  const removeTags = args.remove_tags || DEFAULT_REVIEW_REMOVE_TAGS;
  const removePrefixes = args.remove_prefixes || DEFAULT_REVIEW_REMOVE_PREFIXES;
  const addTags = args.add_tags || DEFAULT_REVIEW_ADD_TAGS;
  const preserveTags = args.preserve_tags || [];
  const results = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const status = String(item.status || "").toLocaleLowerCase();
    const decision = String(item.decision || "").toLocaleLowerCase();
    if (status !== "cleared" && decision !== "approve") continue;
    const fireflyId = item.firefly_id || item.transaction_id;
    if (!fireflyId) {
      results.push({ external_id: item.external_id || null, status: "skipped-missing-firefly-id" });
      continue;
    }
    const result = await updateTransactionTagsVerified({
      transaction_id: fireflyId,
      remove_tags: removeTags,
      remove_prefixes: removePrefixes,
      preserve_tags: preserveTags,
      add_tags: addTags,
      dry_run: args.dry_run
    });
    results.push({
      firefly_id: String(fireflyId),
      external_id: item.external_id || null,
      status: result.status === "updated" ? "cleared" : result.status,
      tags: result.after_tags || result.expected_tags || [],
      active_review_tags_left: result.active_review_tags_left || [],
      missing_expected_tags: result.missing_expected_tags || []
    });
  }
  const failed = results.filter(item => !["cleared", "dry-run"].includes(item.status));
  return { updated_count: results.length - failed.length, failed_count: failed.length, results };
}

const transactionsTools = [
  {
    name: "list_transactions",
    description: "List recent transactions.",
    inputSchema: { type: "object", properties: { limit: { type: "number", default: 10 } } },
    handler: async (args) => (await apiClient.get("/transactions", { params: { limit: args.limit || 10 } })).data
  },
  {
    name: "get_transaction",
    description: "Get a single transaction by ID.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => (await apiClient.get(`/transactions/${args.id}`)).data
  },
  {
    name: "get_transactions_compact",
    description: "Fetch compact transaction rows by IDs or date window, with optional filters for external IDs, source document, account names, and tags.",
    inputSchema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Firefly transaction-group IDs to fetch directly." },
        external_ids: { type: "array", items: { type: "string" } },
        source_document_id: { type: "string" },
        statement_date: { type: "string" },
        start: { type: "string", description: "YYYY-MM-DD start date for paged history fetch." },
        end: { type: "string", description: "YYYY-MM-DD end date for paged history fetch." },
        type: { type: "string", enum: ["withdrawal", "deposit", "transfer"] },
        source_name: { type: "string" },
        destination_name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        include_notes: { type: "boolean", default: false },
        limit: { type: "number", default: 100 },
        max_pages: { type: "number", default: 10 }
      }
    },
    handler: getTransactionsCompact
  },
  {
    name: "create_transaction",
    description: "Create a simple withdrawal, deposit, or transfer.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["withdrawal", "deposit", "transfer"] },
        amount: { type: "string" },
        description: { type: "string" },
        source_name: { type: "string" },
        destination_name: { type: "string" },
        category_name: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        date: { type: "string", description: "YYYY-MM-DD format. Defaults to today." }
      },
      required: ["type", "amount", "description", "source_name", "destination_name"]
    },
    handler: async (args) => {
      const today = new Date().toISOString().split('T')[0];
      const payload = {
        error_if_duplicate_hash: false,
        transactions: [{ ...args, date: args.date || today }]
      };
      await apiClient.post("/transactions", payload);
      return { message: "Transaction created successfully." };
    }
  },
  {
    name: "create_split_transaction",
    description: "Create a single transaction divided into multiple splits (e.g., one receipt with different categories).",
    inputSchema: {
      type: "object",
      properties: {
        group_title: { type: "string", description: "Optional title for the transaction group." },
        splits: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["withdrawal", "deposit", "transfer"] },
              amount: { type: "string" },
              description: { type: "string" },
              source_name: { type: "string" },
              destination_name: { type: "string" },
              category_name: { type: "string" },
              tags: { type: "array", items: { type: "string" } }
            },
            required: ["type", "amount", "description", "source_name", "destination_name"]
          }
        }
      },
      required: ["splits"]
    },
    handler: async (args) => {
      const payload = {
        group_title: args.group_title,
        transactions: args.splits.map(s => ({ ...s, date: s.date || new Date().toISOString().split('T')[0] }))
      };
      await apiClient.post("/transactions", payload);
      return { message: "Split transaction created successfully." };
    }
  },
  {
    name: "update_transaction",
    description: "Update an existing transaction. Supports updating description, category_name, and other fields.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        description: { type: "string" },
        category_name: { type: "string", description: "Category name to assign to the transaction." },
        tags: { type: "array", items: { type: "string" } }
      },
      required: ["id"]
    },
    handler: async (args) => {
      const { id, ...data } = args;
      return (await apiClient.put(`/transactions/${id}`, data)).data;
    }
  },
  {
    name: "update_transaction_tags_verified",
    description: "Safely replace tags on one transaction by GET → PUT full transaction payload → GET verification.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "string" },
        id: { type: "string", description: "Alias for transaction_id." },
        remove_tags: { type: "array", items: { type: "string" } },
        remove_prefixes: { type: "array", items: { type: "string" } },
        preserve_tags: { type: "array", items: { type: "string" }, description: "Exact tags or prefix globs like statement-* that must be preserved." },
        add_tags: { type: "array", items: { type: "string" } },
        dry_run: { type: "boolean", default: false }
      }
    },
    handler: updateTransactionTagsVerified
  },
  {
    name: "apply_review_decisions",
    description: "Apply cleared suspicious-transaction decisions by clearing review tags, adding reviewed/cleared tags, and verifying readback.",
    inputSchema: {
      type: "object",
      properties: {
        decisions: { type: "object", description: "Object containing suspicious_transactions/decisions." },
        remove_tags: { type: "array", items: { type: "string" } },
        remove_prefixes: { type: "array", items: { type: "string" } },
        preserve_tags: { type: "array", items: { type: "string" } },
        add_tags: { type: "array", items: { type: "string" } },
        dry_run: { type: "boolean", default: false }
      }
    },
    handler: applyReviewDecisions
  },
  {
    name: "delete_transaction",
    description: "Permanently delete a transaction.",
    inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    handler: async (args) => {
      await apiClient.delete(`/transactions/${args.id}`);
      return { message: "Transaction deleted successfully." };
    }
  },
  {
    name: "search_transactions",
    description: "Search for transactions.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", default: 10 } },
      required: ["query"]
    },
    handler: async (args) => (await apiClient.get("/search/transactions", { params: { query: args.query, limit: args.limit || 10 } })).data
  }
];

module.exports = transactionsTools;
