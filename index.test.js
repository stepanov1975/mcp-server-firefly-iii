process.env.NODE_ENV = "test";

const { mcpServer, TOOLS, apiClient } = require("./index.js");
const axiosMockAdapter = require("axios-mock-adapter");

const mock = new axiosMockAdapter(apiClient);

// Helper: find a tool by name
const t = (name) => TOOLS.find(tool => tool.name === name);

beforeEach(() => mock.reset());

// ---------------------------------------------------------------------------
// 1. TOOL REGISTRY
// ---------------------------------------------------------------------------
describe("Tool Registry", () => {
  test("registers exactly 66 tools", () => {
    expect(TOOLS.length).toBe(66);
  });

  test("all tool names are unique", () => {
    const names = TOOLS.map(tool => tool.name);
    expect(new Set(names).size).toBe(66);
  });

  test("every tool has name, description, inputSchema, and handler", () => {
    for (const tool of TOOLS) {
      expect(typeof tool.name).toBe("string");
      expect(typeof tool.description).toBe("string");
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.handler).toBe("function");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. MCP SERVER
// ---------------------------------------------------------------------------
describe("MCP Server", () => {
  test("CallToolRequestSchema handler throws on unknown tool", async () => {
    const handler = mcpServer._requestHandlers.get("tools/call");
    const response = await handler({ method: "tools/call", params: { name: "nonexistent_tool", arguments: {} } });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("nonexistent_tool");
  });

  test("CallToolRequestSchema handler returns JSON text on success", async () => {
    mock.onGet("/about").reply(200, { version: "6.0.0" });
    const handler = mcpServer._requestHandlers.get("tools/call");
    const response = await handler({ method: "tools/call", params: { name: "get_about", arguments: {} } });
    expect(response.isError).toBeUndefined();
    expect(response.content[0].type).toBe("text");
    const parsed = JSON.parse(response.content[0].text);
    expect(parsed.version).toBe("6.0.0");
  });

  test("ListToolsRequestSchema handler omits handler functions", async () => {
    const handler = mcpServer._requestHandlers.get("tools/list");
    const response = await handler({ method: "tools/list" });
    expect(response.tools.length).toBe(66);
    expect(response.tools[0].handler).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 3. CORE
// ---------------------------------------------------------------------------
describe("Core", () => {
  test("get_about: GET /about", async () => {
    const data = { version: "6.0.0", api_version: "2.0.0" };
    mock.onGet("/about").reply(200, data);
    const result = await t("get_about").handler({});
    expect(result).toEqual(data);
    expect(mock.history.get[0].url).toBe("/about");
  });
});

// ---------------------------------------------------------------------------
// 4. ACCOUNTS
// ---------------------------------------------------------------------------
describe("Accounts", () => {
  test("list_accounts: GET /accounts with default type=asset", async () => {
    mock.onGet("/accounts").reply(200, { data: [] });
    await t("list_accounts").handler({});
    expect(mock.history.get[0].params).toEqual({ type: "asset" });
  });

  test("list_accounts: passes explicit type filter", async () => {
    mock.onGet("/accounts").reply(200, { data: [] });
    await t("list_accounts").handler({ type: "expense" });
    expect(mock.history.get[0].params).toEqual({ type: "expense" });
  });

  test("get_account: GET /accounts/:id", async () => {
    mock.onGet("/accounts/42").reply(200, { id: 42 });
    const result = await t("get_account").handler({ id: "42" });
    expect(mock.history.get[0].url).toBe("/accounts/42");
    expect(result.id).toBe(42);
  });

  test("create_account: POST /accounts with payload", async () => {
    mock.onPost("/accounts").reply(201, { id: 1 });
    await t("create_account").handler({ name: "Savings", type: "asset" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.name).toBe("Savings");
    expect(body.type).toBe("asset");
  });

  test("update_account: PUT /accounts/:id", async () => {
    mock.onPut("/accounts/5").reply(200, { id: 5 });
    await t("update_account").handler({ id: "5", name: "Updated" });
    expect(mock.history.put[0].url).toBe("/accounts/5");
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.name).toBe("Updated");
    expect(body.id).toBeUndefined();
  });

  test("delete_account: DELETE /accounts/:id", async () => {
    mock.onDelete("/accounts/7").reply(204);
    const result = await t("delete_account").handler({ id: "7" });
    expect(mock.history.delete[0].url).toBe("/accounts/7");
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 5. TRANSACTIONS
// ---------------------------------------------------------------------------
describe("Transactions", () => {
  test("list_transactions: GET /transactions with default limit", async () => {
    mock.onGet("/transactions").reply(200, { data: [] });
    await t("list_transactions").handler({});
    expect(mock.history.get[0].params).toEqual({ limit: 10 });
  });

  test("list_transactions: respects custom limit", async () => {
    mock.onGet("/transactions").reply(200, { data: [] });
    await t("list_transactions").handler({ limit: 25 });
    expect(mock.history.get[0].params).toEqual({ limit: 25 });
  });

  test("get_transaction: GET /transactions/:id", async () => {
    mock.onGet("/transactions/99").reply(200, { id: 99 });
    const result = await t("get_transaction").handler({ id: "99" });
    expect(mock.history.get[0].url).toBe("/transactions/99");
    expect(result.id).toBe(99);
  });

  test("create_transaction: POST /transactions with correct envelope", async () => {
    mock.onPost("/transactions").reply(201, {});
    await t("create_transaction").handler({
      type: "withdrawal", amount: "50.00",
      description: "Coffee", source_name: "Checking", destination_name: "Coffee Shop"
    });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.error_if_duplicate_hash).toBe(false);
    expect(body.transactions[0].type).toBe("withdrawal");
    expect(body.transactions[0].amount).toBe("50.00");
    // Date should be YYYY-MM-DD, not a full ISO 8601 timestamp
    expect(body.transactions[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("create_transaction: uses provided date", async () => {
    mock.onPost("/transactions").reply(201, {});
    await t("create_transaction").handler({
      type: "deposit", amount: "100", description: "Salary",
      source_name: "Employer", destination_name: "Checking", date: "2024-01-15"
    });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.transactions[0].date).toBe("2024-01-15");
  });

  test("create_split_transaction: POST /transactions with splits array", async () => {
    mock.onPost("/transactions").reply(201, {});
    await t("create_split_transaction").handler({
      group_title: "Groceries",
      splits: [
        { type: "withdrawal", amount: "20", description: "Veggies", source_name: "Checking", destination_name: "Market" },
        { type: "withdrawal", amount: "30", description: "Meat", source_name: "Checking", destination_name: "Market" }
      ]
    });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.group_title).toBe("Groceries");
    expect(body.transactions.length).toBe(2);
    expect(body.transactions[0].amount).toBe("20");
    // Dates on splits should be YYYY-MM-DD
    expect(body.transactions[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("update_transaction: PUT /transactions/:id, strips id from body", async () => {
    mock.onPut("/transactions/10").reply(200, {});
    await t("update_transaction").handler({ id: "10", description: "Fixed" });
    expect(mock.history.put[0].url).toBe("/transactions/10");
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.id).toBeUndefined();
    expect(body.description).toBe("Fixed");
  });

  test("delete_transaction: DELETE /transactions/:id", async () => {
    mock.onDelete("/transactions/3").reply(204);
    const result = await t("delete_transaction").handler({ id: "3" });
    expect(result.message).toMatch(/successfully/i);
  });

  test("search_transactions: GET /search/transactions with query and limit", async () => {
    mock.onGet("/search/transactions").reply(200, { data: [] });
    await t("search_transactions").handler({ query: "coffee", limit: 5 });
    expect(mock.history.get[0].params).toEqual({ query: "coffee", limit: 5 });
  });

  test("search_transactions: defaults to limit 10", async () => {
    mock.onGet("/search/transactions").reply(200, { data: [] });
    await t("search_transactions").handler({ query: "rent" });
    expect(mock.history.get[0].params.limit).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 6. BUDGETS
// ---------------------------------------------------------------------------
describe("Budgets", () => {
  test("list_budgets: GET /budgets", async () => {
    mock.onGet("/budgets").reply(200, { data: [] });
    const result = await t("list_budgets").handler({});
    expect(mock.history.get[0].url).toBe("/budgets");
    expect(result.data).toEqual([]);
  });

  test("get_budget: GET /budgets/:id", async () => {
    mock.onGet("/budgets/2").reply(200, { id: 2 });
    await t("get_budget").handler({ id: "2" });
    expect(mock.history.get[0].url).toBe("/budgets/2");
  });

  test("create_budget: POST /budgets", async () => {
    mock.onPost("/budgets").reply(201, { id: 3 });
    await t("create_budget").handler({ name: "Food" });
    expect(JSON.parse(mock.history.post[0].data).name).toBe("Food");
  });

  test("update_budget: PUT /budgets/:id, strips id", async () => {
    mock.onPut("/budgets/4").reply(200, {});
    await t("update_budget").handler({ id: "4", active: false });
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.id).toBeUndefined();
    expect(body.active).toBe(false);
  });

  test("delete_budget: DELETE /budgets/:id", async () => {
    mock.onDelete("/budgets/5").reply(204);
    const result = await t("delete_budget").handler({ id: "5" });
    expect(result.message).toMatch(/successfully/i);
  });

  test("list_budget_limits: GET /budgets/:id/limits", async () => {
    mock.onGet("/budgets/6/limits").reply(200, { data: [] });
    await t("list_budget_limits").handler({ id: "6" });
    expect(mock.history.get[0].url).toBe("/budgets/6/limits");
  });

  test("create_budget_limit: POST /budgets/:id/limits, strips id", async () => {
    mock.onPost("/budgets/7/limits").reply(201, {});
    await t("create_budget_limit").handler({ id: "7", amount: "500", start: "2024-01-01", end: "2024-01-31" });
    expect(mock.history.post[0].url).toBe("/budgets/7/limits");
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.id).toBeUndefined();
    expect(body.amount).toBe("500");
  });

  test("delete_budget_limit: DELETE /budgets/:budget_id/limits/:limit_id", async () => {
    mock.onDelete("/budgets/8/limits/9").reply(204);
    const result = await t("delete_budget_limit").handler({ budget_id: "8", limit_id: "9" });
    expect(mock.history.delete[0].url).toBe("/budgets/8/limits/9");
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 7. AUTOMATION (Rules & Webhooks)
// ---------------------------------------------------------------------------
describe("Automation", () => {
  test("list_rules: GET /rules", async () => {
    mock.onGet("/rules").reply(200, { data: [] });
    await t("list_rules").handler({});
    expect(mock.history.get[0].url).toBe("/rules");
  });

  test("get_rule: GET /rules/:id", async () => {
    mock.onGet("/rules/1").reply(200, { id: 1 });
    await t("get_rule").handler({ id: "1" });
    expect(mock.history.get[0].url).toBe("/rules/1");
  });

  test("create_rule: POST /rules with required fields", async () => {
    mock.onPost("/rules").reply(201, { id: 2 });
    await t("create_rule").handler({ title: "Tag food", trigger: "store-journal", rule_group_id: "1" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.title).toBe("Tag food");
    expect(body.trigger).toBe("store-journal");
  });

  test("update_rule: PUT /rules/:id, strips id", async () => {
    mock.onPut("/rules/3").reply(200, {});
    await t("update_rule").handler({ id: "3", title: "Updated rule" });
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.id).toBeUndefined();
    expect(body.title).toBe("Updated rule");
  });

  test("delete_rule: DELETE /rules/:id", async () => {
    mock.onDelete("/rules/4").reply(204);
    const result = await t("delete_rule").handler({ id: "4" });
    expect(result.message).toMatch(/successfully/i);
  });

  test("list_rule_groups: GET /rule-groups", async () => {
    mock.onGet("/rule-groups").reply(200, { data: [] });
    await t("list_rule_groups").handler({});
    expect(mock.history.get[0].url).toBe("/rule-groups");
  });

  test("get_rule_group: GET /rule-groups/:id", async () => {
    mock.onGet("/rule-groups/5").reply(200, { id: 5 });
    await t("get_rule_group").handler({ id: "5" });
    expect(mock.history.get[0].url).toBe("/rule-groups/5");
  });

  test("trigger_rule_group: POST /rule-groups/:id/trigger", async () => {
    mock.onPost("/rule-groups/6/trigger").reply(200, {});
    const result = await t("trigger_rule_group").handler({ id: "6" });
    expect(mock.history.post[0].url).toBe("/rule-groups/6/trigger");
    expect(result.message).toMatch(/successfully/i);
  });

  test("list_webhooks: GET /webhooks", async () => {
    mock.onGet("/webhooks").reply(200, { data: [] });
    await t("list_webhooks").handler({});
    expect(mock.history.get[0].url).toBe("/webhooks");
  });

  test("create_webhook: POST /webhooks with required fields", async () => {
    mock.onPost("/webhooks").reply(201, { id: 1 });
    await t("create_webhook").handler({ title: "My hook", url: "https://example.com/hook", trigger: "STORE_TRANSACTION" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.title).toBe("My hook");
    expect(body.url).toBe("https://example.com/hook");
  });

  test("delete_webhook: DELETE /webhooks/:id", async () => {
    mock.onDelete("/webhooks/7").reply(204);
    const result = await t("delete_webhook").handler({ id: "7" });
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 8. SYSTEM (Currencies & Preferences)
// ---------------------------------------------------------------------------
describe("System", () => {
  test("list_currencies: GET /currencies", async () => {
    mock.onGet("/currencies").reply(200, { data: [] });
    await t("list_currencies").handler({});
    expect(mock.history.get[0].url).toBe("/currencies");
  });

  test("get_currency: GET /currencies/:code", async () => {
    mock.onGet("/currencies/EUR").reply(200, { code: "EUR" });
    const result = await t("get_currency").handler({ code: "EUR" });
    expect(mock.history.get[0].url).toBe("/currencies/EUR");
    expect(result.code).toBe("EUR");
  });

  test("create_currency: POST /currencies", async () => {
    mock.onPost("/currencies").reply(201, {});
    await t("create_currency").handler({ name: "Bitcoin", code: "BTC", symbol: "₿" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.code).toBe("BTC");
  });

  test("update_currency: PUT /currencies/:code, strips code from body", async () => {
    mock.onPut("/currencies/USD").reply(200, {});
    await t("update_currency").handler({ code: "USD", enabled: true });
    expect(mock.history.put[0].url).toBe("/currencies/USD");
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.code).toBeUndefined();
    expect(body.enabled).toBe(true);
  });

  test("delete_currency: DELETE /currencies/:code", async () => {
    mock.onDelete("/currencies/BTC").reply(204);
    const result = await t("delete_currency").handler({ code: "BTC" });
    expect(result.message).toMatch(/successfully/i);
  });

  test("list_preferences: GET /preferences", async () => {
    mock.onGet("/preferences").reply(200, { data: [] });
    await t("list_preferences").handler({});
    expect(mock.history.get[0].url).toBe("/preferences");
  });

  test("get_preference: GET /preferences/:name", async () => {
    mock.onGet("/preferences/language").reply(200, { name: "language", data: "en" });
    const result = await t("get_preference").handler({ name: "language" });
    expect(mock.history.get[0].url).toBe("/preferences/language");
    expect(result.data).toBe("en");
  });

  test("update_preference: PUT /preferences/:name with data field", async () => {
    mock.onPut("/preferences/language").reply(200, {});
    await t("update_preference").handler({ name: "language", data: "pt" });
    expect(mock.history.put[0].url).toBe("/preferences/language");
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.data).toBe("pt");
  });
});

// ---------------------------------------------------------------------------
// 9. INSIGHTS (Attachments & Analytics)
// ---------------------------------------------------------------------------
describe("Insights", () => {
  test("list_attachments: GET /attachments", async () => {
    mock.onGet("/attachments").reply(200, { data: [] });
    await t("list_attachments").handler({});
    expect(mock.history.get[0].url).toBe("/attachments");
  });

  test("get_attachment: GET /attachments/:id", async () => {
    mock.onGet("/attachments/11").reply(200, { id: 11 });
    await t("get_attachment").handler({ id: "11" });
    expect(mock.history.get[0].url).toBe("/attachments/11");
  });

  test("upload_attachment: two-step POST /attachments then POST /attachments/:id/upload", async () => {
    mock.onPost("/attachments").reply(201, { data: { id: "12" } });
    mock.onPost("/attachments/12/upload").reply(200, {});
    const result = await t("upload_attachment").handler({ filename: "receipt.jpg", attachable_type: "TransactionJournal", attachable_id: "5", content: "aGVsbG8=" });
    // First call creates the metadata record
    expect(mock.history.post[0].url).toBe("/attachments");
    const meta = JSON.parse(mock.history.post[0].data);
    expect(meta.filename).toBe("receipt.jpg");
    expect(meta.content).toBeUndefined(); // content must NOT be sent in metadata step
    // Second call uploads the binary content
    expect(mock.history.post[1].url).toBe("/attachments/12/upload");
    expect(result.id).toBe("12");
  });

  test("delete_attachment: DELETE /attachments/:id", async () => {
    mock.onDelete("/attachments/13").reply(204);
    const result = await t("delete_attachment").handler({ id: "13" });
    expect(result.message).toMatch(/successfully/i);
  });

  test("get_account_overview_chart: GET /charts/account/overview with params", async () => {
    mock.onGet("/charts/account/overview").reply(200, []);
    await t("get_account_overview_chart").handler({ start: "2024-01-01", end: "2024-12-31" });
    expect(mock.history.get[0].url).toBe("/charts/account/overview");
    expect(mock.history.get[0].params).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });

  test("get_net_worth_summary: GET /summary/basic with params", async () => {
    mock.onGet("/summary/basic").reply(200, { net_worth: "5000" });
    const result = await t("get_net_worth_summary").handler({ start: "2024-01-01", end: "2024-12-31" });
    expect(mock.history.get[0].url).toBe("/summary/basic");
    expect(mock.history.get[0].params).toEqual({ start: "2024-01-01", end: "2024-12-31" });
    expect(result.net_worth).toBe("5000");
  });

  test("get_spending_summary: GET /insight/expense/category with params", async () => {
    mock.onGet("/insight/expense/category").reply(200, { data: [] });
    await t("get_spending_summary").handler({ start: "2024-01-01", end: "2024-12-31" });
    expect(mock.history.get[0].url).toBe("/insight/expense/category");
    expect(mock.history.get[0].params).toEqual({ start: "2024-01-01", end: "2024-12-31" });
  });
});

// ---------------------------------------------------------------------------
// 10. META (Categories & Tags)
// ---------------------------------------------------------------------------
describe("Meta", () => {
  test("list_categories: GET /categories", async () => {
    mock.onGet("/categories").reply(200, { data: [] });
    await t("list_categories").handler({});
    expect(mock.history.get[0].url).toBe("/categories");
  });

  test("create_category: POST /categories", async () => {
    mock.onPost("/categories").reply(201, { id: 1 });
    await t("create_category").handler({ name: "Food" });
    expect(JSON.parse(mock.history.post[0].data).name).toBe("Food");
  });

  test("list_tags: GET /tags", async () => {
    mock.onGet("/tags").reply(200, { data: [] });
    await t("list_tags").handler({});
    expect(mock.history.get[0].url).toBe("/tags");
  });

  test("create_tag: POST /tags", async () => {
    mock.onPost("/tags").reply(201, { id: 1 });
    await t("create_tag").handler({ tag: "work" });
    expect(JSON.parse(mock.history.post[0].data).tag).toBe("work");
  });
});

// ---------------------------------------------------------------------------
// 11. BILLS & PIGGY BANKS
// ---------------------------------------------------------------------------
describe("Bills", () => {
  test("list_bills: GET /bills", async () => {
    mock.onGet("/bills").reply(200, { data: [] });
    await t("list_bills").handler({});
    expect(mock.history.get[0].url).toBe("/bills");
  });

  test("create_bill: POST /bills with required fields", async () => {
    mock.onPost("/bills").reply(201, { id: 1 });
    await t("create_bill").handler({ name: "Netflix", amount_min: "15", amount_max: "15", date: "2024-01-01", repeat_freq: "monthly" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.name).toBe("Netflix");
    expect(body.repeat_freq).toBe("monthly");
  });

  test("delete_bill: DELETE /bills/:id", async () => {
    mock.onDelete("/bills/2").reply(204);
    const result = await t("delete_bill").handler({ id: "2" });
    expect(result.message).toMatch(/successfully/i);
  });
});

describe("Piggy Banks", () => {
  test("list_piggy_banks: GET /piggy-banks", async () => {
    mock.onGet("/piggy-banks").reply(200, { data: [] });
    await t("list_piggy_banks").handler({});
    expect(mock.history.get[0].url).toBe("/piggy-banks");
  });

  test("create_piggy_bank: POST /piggy-banks", async () => {
    mock.onPost("/piggy-banks").reply(201, { id: 1 });
    await t("create_piggy_bank").handler({ name: "Vacation", target_amount: "2000", account_id: "1" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.name).toBe("Vacation");
    expect(body.target_amount).toBe("2000");
  });

  test("update_piggy_bank: POST /piggy-banks/:id/events", async () => {
    mock.onPost("/piggy-banks/3/events").reply(200, {});
    const result = await t("update_piggy_bank").handler({ id: "3", amount: "100" });
    expect(mock.history.post[0].url).toBe("/piggy-banks/3/events");
    expect(JSON.parse(mock.history.post[0].data).amount).toBe("100");
    expect(result.message).toMatch(/successfully/i);
  });

  test("delete_piggy_bank: DELETE /piggy-banks/:id", async () => {
    mock.onDelete("/piggy-banks/4").reply(204);
    const result = await t("delete_piggy_bank").handler({ id: "4" });
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 12. OBJECT GROUPS
// ---------------------------------------------------------------------------
describe("Object Groups", () => {
  test("list_object_groups: GET /object-groups", async () => {
    mock.onGet("/object-groups").reply(200, { data: [] });
    await t("list_object_groups").handler({});
    expect(mock.history.get[0].url).toBe("/object-groups");
  });

  test("create_object_group: POST /object-groups", async () => {
    mock.onPost("/object-groups").reply(201, { id: 1 });
    await t("create_object_group").handler({ title: "Savings", order: 1 });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.title).toBe("Savings");
  });
});

// ---------------------------------------------------------------------------
// 13. RECURRING TRANSACTIONS
// ---------------------------------------------------------------------------
describe("Recurring Transactions", () => {
  test("list_recurring: GET /recurring", async () => {
    mock.onGet("/recurring").reply(200, { data: [] });
    await t("list_recurring").handler({});
    expect(mock.history.get[0].url).toBe("/recurring");
  });

  test("get_recurring: GET /recurring/:id", async () => {
    mock.onGet("/recurring/1").reply(200, { id: 1 });
    await t("get_recurring").handler({ id: "1" });
    expect(mock.history.get[0].url).toBe("/recurring/1");
  });

  test("create_recurring: POST /recurring with required fields", async () => {
    mock.onPost("/recurring").reply(201, { id: 1 });
    await t("create_recurring").handler({ name: "Rent", type: "withdrawal", amount: "1200", repeat_freq: "monthly", source_name: "Checking", destination_name: "Landlord" });
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.name).toBe("Rent");
    expect(body.repeat_freq).toBe("monthly");
  });

  test("update_recurring: PUT /recurring/:id, strips id", async () => {
    mock.onPut("/recurring/2").reply(200, {});
    await t("update_recurring").handler({ id: "2", active: false });
    const body = JSON.parse(mock.history.put[0].data);
    expect(body.id).toBeUndefined();
    expect(body.active).toBe(false);
  });

  test("delete_recurring: DELETE /recurring/:id", async () => {
    mock.onDelete("/recurring/3").reply(204);
    const result = await t("delete_recurring").handler({ id: "3" });
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 14. ADMIN
// ---------------------------------------------------------------------------
describe("Admin", () => {
  test("trigger_export: POST /data/export/transactions", async () => {
    mock.onPost("/data/export/transactions").reply(200, {});
    const result = await t("trigger_export").handler({ start: "2024-01-01", end: "2024-12-31" });
    expect(mock.history.post[0].url).toBe("/data/export/transactions");
    const body = JSON.parse(mock.history.post[0].data);
    expect(body.start).toBe("2024-01-01");
    expect(result.message).toMatch(/successfully/i);
  });
});

// ---------------------------------------------------------------------------
// 15. ERROR HANDLING
// ---------------------------------------------------------------------------
describe("Error Handling", () => {
  test("API error response is propagated to MCP handler as isError", async () => {
    mock.onGet("/about").reply(401, { message: "Unauthorized" });
    const handler = mcpServer._requestHandlers.get("tools/call");
    const response = await handler({ method: "tools/call", params: { name: "get_about", arguments: {} } });
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Unauthorized");
  });

  test("non-API error is propagated as plain message", async () => {
    mock.onGet("/about").networkError();
    const handler = mcpServer._requestHandlers.get("tools/call");
    const response = await handler({ method: "tools/call", params: { name: "get_about", arguments: {} } });
    expect(response.isError).toBe(true);
    expect(typeof response.content[0].text).toBe("string");
  });
});
