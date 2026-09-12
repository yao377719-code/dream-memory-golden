import test from "node:test";
import assert from "node:assert/strict";

import { generateCustomerIdentities } from "../scripts/generate-customer-identities.mjs";

test("new customer identities use unique unpredictable names", () => {
  const identities = generateCustomerIdentities({ count: 100, suffixLength: 6 });
  assert.equal(new Set(identities.map((item) => item.projectName)).size, 100);
  assert.equal(new Set(identities.map((item) => item.customerId)).size, 100);
  for (const identity of identities) {
    assert.match(identity.projectName, /^dream-memory-[a-z]+-(?=[a-z0-9]{6}$)(?=.*[a-z])(?=.*\d)[a-z0-9]{6}$/);
    assert.match(identity.customerId, /^customer-[a-z]+-(?=[a-z0-9]{6}$)(?=.*[a-z])(?=.*\d)[a-z0-9]{6}$/);
    assert.equal(identity.siteUrl, `https://${identity.projectName}.pages.dev`);
    assert.equal(identity.adminUrl, `${identity.siteUrl}/admin/`);
  }
});

test("reserved project and customer names are never reused", () => {
  const reserved = ["dream-memory-luna-a1b2c", "customer-luna-a1b2c"];
  const identities = generateCustomerIdentities({ count: 20, suffixLength: 5, reservedNames: reserved });
  assert.equal(identities.some((item) => reserved.includes(item.projectName) || reserved.includes(item.customerId)), false);
});

test("suffix length is restricted to five through eight characters", () => {
  for (const suffixLength of [5, 6, 7, 8]) {
    const [identity] = generateCustomerIdentities({ suffixLength });
    assert.equal(identity.projectName.split("-").at(-1).length, suffixLength);
  }
  assert.throws(() => generateCustomerIdentities({ suffixLength: 4 }), /5～8/);
  assert.throws(() => generateCustomerIdentities({ suffixLength: 9 }), /5～8/);
});

// Naming constraints above are part of the customer provisioning contract.
