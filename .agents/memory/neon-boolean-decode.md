---
name: Neon endpoint boolean decode bug (fixed at transport layer)
description: The Neon-compatible HTTP endpoint sends bool cells as raw JSON booleans despite text format; driver parsed them all to false. Fixed in the custom fetchFunction.
---

The Neon-compatible HTTP endpoint backing this app's DATABASE_URL returns boolean column cells as raw JSON `true`/`false` in `rows`, even though the field metadata says `format: "text"`. The neon-http driver then runs postgres' *text* parser for bool (typeId 16), which only recognizes strings like `'t'`/`'true'` — a JS boolean matches neither, so every boolean column parsed to `false` (`select true` read back `false`).

**Why:** Verified by dumping the raw HTTP payload: `{"fields":[{...dataTypeID:16,format:"text"}],"rows":[[true,false]]}` parsed to `{t:false,f:false}`.

**Fix (in place):** The custom `neonConfig.fetchFunction` in `server/db.ts` re-encodes boolean cells of bool-typed fields as `'t'`/`'f'` text before the driver parses the payload, for both single queries and batch `results`. Boolean columns now read correctly everywhere.

**How to apply:** If a new boolean column reads wrong, check that queries go through the patched `db` from `server/db.ts` (any separate `neon()` client bypasses nothing — the patch is global via `neonConfig`, so it applies as long as `server/db.ts` was imported first). Legacy contracted-route rows may still hold a wrong stored `is_custom`; `custom_miles != null` remains the fallback there.
