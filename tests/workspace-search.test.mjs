import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSearchHistory, rememberSearch, searchHistoryKey, searchPattern } from "../src/lib/workspace-search.ts";

test("history is bounded, deduplicated and scoped to account and tenant", () => {
  assert.deepEqual(normalizeSearchHistory(null), []);
  assert.deepEqual(normalizeSearchHistory([" Orders ", "Orders", null, ""]), ["Orders"]);
  assert.deepEqual(rememberSearch(["tables", "orders"], "Orders"), ["Orders", "tables"]);
  assert.equal(rememberSearch(Array.from({length: 12}, (_, i) => `q${i}`), "new").length, 8);
  assert.notEqual(searchHistoryKey("a", "one"), searchHistoryKey("b", "one"));
  assert.notEqual(searchHistoryKey("a", "one"), searchHistoryKey("a", "two"));
});
test("search terms cannot introduce filter syntax or unbounded wildcards", () => {
  assert.equal(searchPattern("table"), "%table%");
  assert.equal(searchPattern("%,name.eq.(x)_"), "%  name eq  x  %");
});