import { test } from "node:test";
import assert from "node:assert/strict";
import { getRateUnit, formatRatePerUnit } from "./rate-unit";

// ===== getRateUnit =====

test("getRateUnit: crude returns 'barrel'", () => {
  assert.equal(getRateUnit("crude"), "barrel");
});

test("getRateUnit: diesel returns 'gallon'", () => {
  assert.equal(getRateUnit("diesel"), "gallon");
});

test("getRateUnit: gasoline returns 'gallon'", () => {
  assert.equal(getRateUnit("gasoline"), "gallon");
});

test("getRateUnit: empty string returns 'gallon'", () => {
  assert.equal(getRateUnit(""), "gallon");
});

test("getRateUnit: undefined returns 'gallon'", () => {
  assert.equal(getRateUnit(undefined), "gallon");
});

test("getRateUnit: null returns 'gallon'", () => {
  assert.equal(getRateUnit(null), "gallon");
});

test("getRateUnit: 'CRUDE' (uppercase) returns 'gallon', not 'barrel' — match is case-sensitive", () => {
  // The load_type coming from the DB is always lowercase 'crude'; this guards
  // against accidental case-insensitive widening of the check.
  assert.equal(getRateUnit("CRUDE"), "gallon");
});

// ===== formatRatePerUnit — single calculation flow =====

test("formatRatePerUnit: crude shows /barrel label", () => {
  const label = formatRatePerUnit(1.85, "crude");
  assert.ok(
    label.includes("/barrel"),
    `Expected "/barrel" in crude label but got: "${label}"`,
  );
  assert.ok(
    !label.includes("/gallon"),
    `Crude label must not contain "/gallon" but got: "${label}"`,
  );
});

test("formatRatePerUnit: diesel shows /gallon label", () => {
  const label = formatRatePerUnit(0.95, "diesel");
  assert.ok(
    label.includes("/gallon"),
    `Expected "/gallon" in diesel label but got: "${label}"`,
  );
  assert.ok(
    !label.includes("/barrel"),
    `Diesel label must not contain "/barrel" but got: "${label}"`,
  );
});

test("formatRatePerUnit: crude formats the dollar value correctly", () => {
  assert.equal(formatRatePerUnit(1.85, "crude"), "$1.85/barrel");
});

test("formatRatePerUnit: diesel formats the dollar value correctly", () => {
  assert.equal(formatRatePerUnit(0.95, "diesel"), "$0.95/gallon");
});

// ===== Batch flow — load_type must be carried through from the top-level batch result =====
//
// The regression: batch map data dropped `load_type`, so `data.load_type` was
// undefined when the overlay rendered, causing crude loads to display "/gallon".
// These tests document the contract that `getRateUnit(undefined)` is "gallon",
// which means any code path that forgets to pass load_type will produce the
// wrong label for crude — making the bug visible immediately.

test("formatRatePerUnit: missing load_type (undefined) falls back to /gallon — detects the batch regression", () => {
  const label = formatRatePerUnit(1.85, undefined);
  assert.equal(
    label,
    "$1.85/gallon",
    "When load_type is missing the label falls back to /gallon; crude calcs will be wrong — this is the regression indicator",
  );
});

test("getRateUnit: crude must never map to 'gallon'", () => {
  assert.notEqual(getRateUnit("crude"), "gallon");
});

test("getRateUnit: diesel must never map to 'barrel'", () => {
  assert.notEqual(getRateUnit("diesel"), "barrel");
});
