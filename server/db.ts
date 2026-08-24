import { drizzle } from 'drizzle-orm/neon-http';
import { neon, neonConfig } from '@neondatabase/serverless';
import * as schema from '@shared/schema';

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not found in environment variables");
}

// The Neon-compatible HTTP endpoint backing this app returns `rows: null`
// (not `[]`) whenever a query matches zero rows, and the neon HTTP driver's
// own result processing unconditionally calls `result.rows.map(...)`. This
// turns any legitimately empty lookup or filtered query (missing customer,
// no contracted routes, empty route cache, etc.) into a cryptic
// "Cannot read properties of null (reading 'map')" crash before Drizzle ever
// sees the result.
//
// NOTE: This is NOT fixed by upgrading the driver. Verified on
// @neondatabase/serverless 1.1.0 — the `rows: null` payload comes from the
// HTTP endpoint, and the 1.x driver still calls `.rows.map(...)` on it, so it
// crashes identically. The only reliable interception point is the transport
// layer, since the throw happens inside the driver before any Drizzle hook.
//
// We patch this globally by supplying a custom fetchFunction that coerces a
// null `rows` back to `[]` in the raw HTTP response body before the driver
// parses it. This handles both single queries (`{ rows, fields }`) and batch
// transactions (`{ results: [{ rows }, ...] }`), protecting every storage read.
// A second endpoint quirk: boolean columns come back in `rows` as raw JSON
// booleans (`true`/`false`) even though the field is marked `format: "text"`.
// The driver then runs postgres' text parser for bool (typeId 16), which only
// recognizes the strings 't'/'true' — a JS boolean matches neither, so EVERY
// boolean column parses to `false` regardless of its stored value (verified:
// `select true` reads back false). We fix it at the same transport layer by
// re-encoding boolean cells of bool-typed fields as 't'/'f' text before the
// driver parses the payload.
const BOOL_TYPE_ID = 16;

function fixBooleanCells(result: any): void {
  if (!result || typeof result !== 'object') return;
  const fields = Array.isArray(result.fields) ? result.fields : [];
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const boolIdx = new Set<number>();
  const boolNames = new Set<string>();
  fields.forEach((f: any, i: number) => {
    if (f && f.dataTypeID === BOOL_TYPE_ID) {
      boolIdx.add(i);
      if (typeof f.name === 'string') boolNames.add(f.name);
    }
  });
  if (boolIdx.size === 0) return;
  for (const row of rows) {
    if (Array.isArray(row)) {
      for (const i of Array.from(boolIdx)) {
        if (typeof row[i] === 'boolean') row[i] = row[i] ? 't' : 'f';
      }
    } else if (row && typeof row === 'object') {
      for (const name of Array.from(boolNames)) {
        if (typeof row[name] === 'boolean') row[name] = row[name] ? 't' : 'f';
      }
    }
  }
}

function coerceNullRows(payload: any): any {
  if (payload && typeof payload === 'object') {
    if ('rows' in payload && payload.rows == null) {
      payload.rows = [];
    }
    fixBooleanCells(payload);
    if (Array.isArray(payload.results)) {
      for (const result of payload.results) {
        if (result && typeof result === 'object' && 'rows' in result && result.rows == null) {
          result.rows = [];
        }
        fixBooleanCells(result);
      }
    }
  }
  return payload;
}

neonConfig.fetchFunction = async (input: any, init: any) => {
  const response = await fetch(input, init);
  if (!response.ok) {
    return response;
  }
  const data = coerceNullRows(await response.json());
  return new Response(JSON.stringify(data), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
};

const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });
