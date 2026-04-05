# Testing Guide

This project uses **Jest** for unit testing and **axios-mock-adapter** to simulate Firefly III API responses without ever hitting a live instance.

## Running Tests

```bash
npm test
```

## Test Coverage

The suite has **78 tests** across **15 describe blocks**, covering all 66 tools:

| Module        | Tests | What is verified |
|---------------|-------|-----------------|
| Tool Registry | 3     | 66 tools registered, unique names, required fields |
| MCP Server    | 3     | Protocol routing, ListTools, CallTool, error wrapping |
| Core          | 1     | `get_about` |
| Accounts      | 6     | Full CRUD + type filtering |
| Transactions  | 9     | Full CRUD, split creation, search, date handling |
| Budgets       | 8     | Full CRUD + limits CRUD |
| Automation    | 11    | Rules CRUD, rule groups, webhooks |
| System        | 8     | Currencies CRUD, preferences CRUD |
| Insights      | 7     | Attachments CRUD, charts, summaries |
| Meta          | 4     | Categories + tags |
| Bills         | 3     | Bills CRUD |
| Piggy Banks   | 4     | Full CRUD including event-based update |
| Object Groups | 2     | List + create |
| Recurring     | 5     | Full CRUD |
| Admin         | 1     | `trigger_export` |
| Error Handling| 2     | API errors (401, network failure) → `isError: true` |

## What Each Test Verifies

Every tool test checks three things:

1. **Correct HTTP method** — GET/POST/PUT/DELETE
2. **Correct URL path** — e.g. `/budgets/7/limits`
3. **Correct params/body** — query params go via `params`, IDs are stripped from PUT bodies

## Testing Philosophy

- **No live requests** — all calls are mocked. `mock.reset()` runs before each test.
- **Tool isolation** — each test uses fresh mocks. No shared state.
- **Behaviour over structure** — tests assert what the tool *does*, not internal implementation.

## Writing a New Test

```javascript
test("create_X: POST /X with correct payload", async () => {
  mock.onPost("/X").reply(201, { id: 1 });
  await t("create_X").handler({ name: "My thing" });
  const body = JSON.parse(mock.history.post[0].data);
  expect(body.name).toBe("My thing");
});
```

Use the `t(name)` helper to find tools. Always verify URL, method, and payload shape.

## Bugs Fixed by This Test Suite

The tests revealed and fixed three bugs in `src/tools/insights.js` where query parameters
were built via string interpolation (`?start=${x}`) instead of the axios `{ params }` option.
This caused `get_net_worth_summary`, `get_spending_summary`, and `get_account_overview_chart`
to receive 404s from the mock adapter (and potentially misrouting in some proxy/reverse-proxy
configurations).
