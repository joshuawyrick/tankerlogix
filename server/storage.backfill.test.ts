import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Guards the one-time is_custom repair for legacy contracted_routes rows.
// Rows written before the boolean-decode fix in server/db.ts may carry a wrong
// stored is_custom flag. backfillContractedRouteIsCustom() aligns is_custom
// with (custom_miles IS NOT NULL), and reads now trust is_custom directly with
// no custom_miles fallback. This test stubs the Neon HTTP endpoint so it runs
// without a real database.

process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@db.example.com/neondb";

const realFetch = globalThis.fetch;

// Captured SQL statements sent to the fake endpoint.
const executed: string[] = [];

// A legacy-shaped contracted_routes row as it looks AFTER the backfill has
// run: custom_miles populated and is_custom repaired to true. The endpoint
// returns booleans as raw JSON booleans (the quirk fixed in server/db.ts), so
// we return `true` here and expect the transport shim + parser to surface it
// as boolean true.
const routeFields = [
  { name: "route_id", dataTypeID: 25 },
  { name: "route_name", dataTypeID: 25 },
  { name: "customer_id", dataTypeID: 25 },
  { name: "pickup_location_id", dataTypeID: 25 },
  { name: "dropoff_location_id", dataTypeID: 25 },
  { name: "product_type", dataTypeID: 25 },
  { name: "avg_volume", dataTypeID: 701 },
  { name: "rate_per_unit", dataTypeID: 701 },
  { name: "rate_type", dataTypeID: 25 },
  { name: "avg_pickup_time", dataTypeID: 701 },
  { name: "avg_dropoff_time", dataTypeID: 701 },
  { name: "avg_speed", dataTypeID: 701 },
  { name: "notes", dataTypeID: 25 },
  { name: "is_custom", dataTypeID: 16 },
  { name: "custom_miles", dataTypeID: 701 },
  { name: "custom_polyline", dataTypeID: 25 },
];

const legacyRouteRow = {
  route_id: "ROUTE_LEGACY1",
  route_name: "Legacy custom route",
  customer_id: null,
  pickup_location_id: "LOC_A",
  dropoff_location_id: "LOC_B",
  product_type: "crude",
  avg_volume: 180,
  rate_per_unit: 2.5,
  rate_type: "per_barrel",
  avg_pickup_time: null,
  avg_dropoff_time: null,
  avg_speed: null,
  notes: null,
  is_custom: true,
  custom_miles: 42.5,
  custom_polyline: "abc123",
};

function fakeNeonFetch(_input: any, init: any): Promise<Response> {
  let body: any = {};
  try {
    body = JSON.parse(init?.body ?? "{}");
  } catch {
    body = {};
  }

  const query: string = body.query ?? "";
  executed.push(query);

  let payload: any;
  if (/^\s*UPDATE/i.test(query)) {
    payload = { rows: [], fields: [], rowCount: 0 };
  } else if (/contracted_routes/i.test(query)) {
    // Drizzle's neon-http driver requests array-mode rows for selects: each
    // row is an array of cell values in the same order as `fields`.
    const rowArray = routeFields.map(
      (f) => (legacyRouteRow as Record<string, unknown>)[f.name],
    );
    payload = { rows: [rowArray], fields: routeFields };
  } else {
    payload = { rows: [], fields: [] };
  }

  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

let storage: typeof import("./storage").storage;
let backfillContractedRouteIsCustom: typeof import("./storage").backfillContractedRouteIsCustom;

before(async () => {
  globalThis.fetch = fakeNeonFetch as unknown as typeof fetch;
  ({ storage, backfillContractedRouteIsCustom } = await import("./storage"));
});

after(() => {
  globalThis.fetch = realFetch;
});

test("backfill issues an idempotent UPDATE aligning is_custom with custom_miles", async () => {
  executed.length = 0;
  await backfillContractedRouteIsCustom();

  const update = executed.find((q) => /^\s*UPDATE/i.test(q));
  assert.ok(update, "expected an UPDATE statement to be sent");
  const normalized = update!.replace(/\s+/g, " ");
  assert.match(normalized, /UPDATE contracted_routes/i);
  assert.match(normalized, /SET is_custom = \(custom_miles IS NOT NULL\)/i);
  // The WHERE clause is what makes the backfill a safe no-op on repeat runs.
  assert.match(
    normalized,
    /WHERE is_custom IS DISTINCT FROM \(custom_miles IS NOT NULL\)/i,
  );
});

test("reads trust the stored is_custom flag directly after the backfill", async () => {
  const route = await storage.getContractedRoute("ROUTE_LEGACY1");
  assert.ok(route);
  assert.equal(route!.is_custom, true);
  assert.equal(route!.custom_miles, 42.5);

  const routes = await storage.getContractedRoutes();
  assert.equal(routes.length, 1);
  assert.equal(routes[0].is_custom, true);
});
