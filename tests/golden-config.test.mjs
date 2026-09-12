import assert from "node:assert/strict";
import test from "node:test";
import { assertRuntimeIdentity } from "../cloudflare/lib/http.mjs";
import { createCustomerConfig, validateCustomerConfig } from "../scripts/lib/customer-config.mjs";

const valid = createCustomerConfig({
  projectName: "dream-memory-luna-a1b2c3",
  customerId: "customer-luna-a1b2c3",
  kvId: "0123456789abcdef0123456789abcdef",
});

test("one config binds Pages, Functions CUSTOMER_ID, and KV", () => {
  assert.deepEqual(validateCustomerConfig(valid), {
    projectName: "dream-memory-luna-a1b2c3",
    customerId: "customer-luna-a1b2c3",
    productionBranch: "customer-luna-a1b2c3",
    kvId: "0123456789abcdef0123456789abcdef",
    siteUrl: "https://dream-memory-luna-a1b2c3.pages.dev",
  });
});

test("mismatched or missing identity fields fail", () => {
  assert.throws(() => validateCustomerConfig({ ...valid, vars: { ...valid.vars, CUSTOMER_ID: "customer-other-a1b2c3" } }), /does not match/);
  assert.throws(() => validateCustomerConfig({ ...valid, vars: { ...valid.vars, PAGES_PROJECT_NAME: "dream-memory-other-a1b2c3" } }), /must match/);
  assert.throws(() => validateCustomerConfig({ ...valid, kv_namespaces: [] }), /DREAM_MEMORY_STORE/);
});

test("runtime rejects wrong Pages host and missing bindings", () => {
  const store = { get() {} };
  const env = { CUSTOMER_ID: valid.vars.CUSTOMER_ID, PAGES_PROJECT_NAME: valid.name, DREAM_MEMORY_STORE: store };
  assert.equal(assertRuntimeIdentity(new Request(`https://${valid.name}.pages.dev/api/site-data`), env, { requireStore: true }).customerId, valid.vars.CUSTOMER_ID);
  assert.throws(() => assertRuntimeIdentity(new Request("https://dream-memory-other-a1b2c3.pages.dev/api/site-data"), env), /hostname/);
  assert.throws(() => assertRuntimeIdentity(new Request(`https://${valid.name}.pages.dev/api/site-data`), { ...env, DREAM_MEMORY_STORE: undefined }, { requireStore: true }), /binding/);
});
