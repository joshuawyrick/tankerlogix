---
name: Neon empty-result driver crash
description: HTTP endpoint returns rows:null on zero-row queries; neon-http driver throws "reading 'map'" — not fixed by driver upgrade
---

# Neon empty-result driver crash

The `@neondatabase/serverless` HTTP driver crashes with
`TypeError: Cannot read properties of null (reading 'map')` whenever a query
returns an **empty result set**. The root cause is the **HTTP endpoint**, not
the driver version: the Replit-provided Neon-compatible proxy (DATABASE_URL host
`helium`) sends back `rows: null` (with `rowCount: 0`) for zero-row results, and
the driver's `processQueryResult` unconditionally calls `result.rows.map(...)`.
The throw happens **inside the neon client**, before Drizzle ever receives the
result, so you cannot fix it by post-processing the value Drizzle gets back.

**Why this is NOT a driver bug fixed by upgrading (verified):**
- Upgrading to `@neondatabase/serverless` 1.1.0 does **not** fix it — the
  `rows: null` payload comes from the endpoint, and the 1.x driver still calls
  `.rows.map(...)` on it, crashing identically on the same code path.
- Worse, neon 1.x is **incompatible with the pinned `drizzle-orm` 0.39.1**
  neon-http adapter: drizzle calls the client with positional args
  (`client(sql, params, config)`), which the 1.x client rejects with
  "This function can now be called only as a tagged-template function". This
  breaks **every** query (all `/api` routes return 500), not just empty ones.
- Net: the driver can only be upgraded in **lockstep with drizzle-orm**.
  Resolved July 2026: drizzle-orm 0.45.x + neon 1.1.x + drizzle-zod 0.8.x +
  drizzle-kit 0.31.x upgraded together and verified working. The shim is still
  REQUIRED — the `rows: null` behavior is the endpoint's, independent of
  driver version. Never remove the `neonConfig.fetchFunction` shim, and never
  bump neon or drizzle-orm independently of each other.

**How to apply (global fix in place):** `server/db.ts` sets
`neonConfig.fetchFunction` to a wrapper around `fetch` that rewrites the raw HTTP
response body, coercing a null `rows` back to `[]` before the driver parses it.
It handles both single-query shape (`{ rows, fields }`) and batch shape
(`{ results: [{ rows }, ...] }`). This protects every storage read centrally, so
no per-call try/catch is needed. The fetch hook is the only interception point
that runs before the driver's result processing.
