import { test, before, after } from "node:test";
import assert from "node:assert/strict";

// Regression guard for the pinned @neondatabase/serverless (0.10.4) HTTP driver
// crash: when a query matches zero rows the Neon HTTP endpoint returns
// `rows: null` and the driver calls `.rows.map(...)` inside its own result
// processing, throwing "Cannot read properties of null (reading 'map')". The
// fix lives in `server/db.ts`, which installs a `neonConfig.fetchFunction` shim
// that coerces a null `rows` back to `[]` in the raw HTTP response body before
// the driver parses it. This test reproduces the empty-result scenario by
// stubbing the network layer so we never touch a real database, then verifies
// that empty lookups resolve cleanly instead of crashing.

// A connection string the neon driver can parse; the real network is stubbed
// below so this never reaches an actual database.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://user:pass@db.example.com/neondb";

const realFetch = globalThis.fetch;

// Stand in for the Neon HTTP endpoint and always answer with the pathological
// `rows: null` shape that used to crash the driver. We inspect the request body
// so a single query gets `{ rows, fields }` and a batch gets
// `{ results: [{ rows, fields }, ...] }`, matching the two shapes the fix
// handles.
function fakeNeonFetch(_input: any, init: any): Promise<Response> {
  let body: any = {};
  try {
    body = JSON.parse(init?.body ?? "{}");
  } catch {
    body = {};
  }

  let payload: any;
  if (Array.isArray(body.queries)) {
    payload = { results: body.queries.map(() => ({ rows: null, fields: [] })) };
  } else {
    payload = { rows: null, fields: [] };
  }

  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
  );
}

let db: typeof import("./db").db;
let storage: typeof import("./storage").storage;
let locationsTable: typeof import("@shared/schema").locationsTable;
let eq: typeof import("drizzle-orm").eq;

before(async () => {
  // Install the network stub before importing db.ts so the driver routes every
  // request through it (the fix's fetchFunction wraps this global fetch).
  globalThis.fetch = fakeNeonFetch as unknown as typeof fetch;

  ({ db } = await import("./db"));
  ({ storage } = await import("./storage"));
  ({ locationsTable } = await import("@shared/schema"));
  ({ eq } = await import("drizzle-orm"));
});

after(() => {
  globalThis.fetch = realFetch;
});

test("an empty single-record lookup returns undefined, not a crash", async () => {
  const result = await storage.getLocation("does-not-exist");
  assert.equal(result, undefined);
});

test("a missing-id select returns zero rows, not a crash", async () => {
  const rows = await db
    .select()
    .from(locationsTable)
    .where(eq(locationsTable.location_id, "does-not-exist"));
  assert.ok(Array.isArray(rows));
  assert.equal(rows.length, 0);
});

test("a batch of empty queries returns empty arrays, not a crash", async () => {
  const [first, second] = await db.batch([
    db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.location_id, "missing-a")),
    db
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.location_id, "missing-b")),
  ]);

  assert.ok(Array.isArray(first));
  assert.equal(first.length, 0);
  assert.ok(Array.isArray(second));
  assert.equal(second.length, 0);
});
