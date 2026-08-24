import { test } from "node:test";
import assert from "node:assert/strict";
import type { Location } from "./schema";
import {
  OPERATING_REGION,
  hasValidCoordinates,
  isWithinOperatingRegion,
  getLocationIssues,
  hasLocationIssues,
  type LocationIssueCode,
} from "./location-validation";

// A point safely inside the Kern County / California operating area.
const INSIDE_LAT = 35.3;
const INSIDE_LON = -119.1;

function codesOf(loc: Partial<Location> & { role?: Location["role"] }): LocationIssueCode[] {
  return getLocationIssues(loc).map((issue) => issue.code);
}

// ===== hasValidCoordinates =====

test("hasValidCoordinates: valid finite coordinates are accepted", () => {
  assert.equal(hasValidCoordinates({ lat: INSIDE_LAT, lon: INSIDE_LON }), true);
});

test("hasValidCoordinates: a non-zero coordinate with a zero counterpart is accepted", () => {
  // Only the exact 0,0 "null island" is rejected; a single zero is legitimate.
  assert.equal(hasValidCoordinates({ lat: 0, lon: INSIDE_LON }), true);
  assert.equal(hasValidCoordinates({ lat: INSIDE_LAT, lon: 0 }), true);
});

test("hasValidCoordinates: null coordinates are rejected", () => {
  assert.equal(
    hasValidCoordinates({ lat: null as unknown as number, lon: INSIDE_LON }),
    false,
  );
  assert.equal(
    hasValidCoordinates({ lat: INSIDE_LAT, lon: null as unknown as number }),
    false,
  );
});

test("hasValidCoordinates: undefined coordinates are rejected", () => {
  assert.equal(
    hasValidCoordinates({ lat: undefined as unknown as number, lon: INSIDE_LON }),
    false,
  );
  assert.equal(
    hasValidCoordinates({ lat: INSIDE_LAT, lon: undefined as unknown as number }),
    false,
  );
});

test("hasValidCoordinates: NaN coordinates are rejected", () => {
  assert.equal(hasValidCoordinates({ lat: NaN, lon: INSIDE_LON }), false);
  assert.equal(hasValidCoordinates({ lat: INSIDE_LAT, lon: NaN }), false);
});

test("hasValidCoordinates: the 0,0 null island is rejected", () => {
  assert.equal(hasValidCoordinates({ lat: 0, lon: 0 }), false);
});

// ===== isWithinOperatingRegion =====

test("isWithinOperatingRegion: a point inside the region is within", () => {
  assert.equal(isWithinOperatingRegion(INSIDE_LAT, INSIDE_LON), true);
});

test("isWithinOperatingRegion: each edge is inclusive", () => {
  const { minLat, maxLat, minLon, maxLon } = OPERATING_REGION;
  assert.equal(isWithinOperatingRegion(minLat, INSIDE_LON), true);
  assert.equal(isWithinOperatingRegion(maxLat, INSIDE_LON), true);
  assert.equal(isWithinOperatingRegion(INSIDE_LAT, minLon), true);
  assert.equal(isWithinOperatingRegion(INSIDE_LAT, maxLon), true);
  // All four corners.
  assert.equal(isWithinOperatingRegion(minLat, minLon), true);
  assert.equal(isWithinOperatingRegion(maxLat, maxLon), true);
});

test("isWithinOperatingRegion: points just outside each edge are out", () => {
  const { minLat, maxLat, minLon, maxLon } = OPERATING_REGION;
  assert.equal(isWithinOperatingRegion(minLat - 0.0001, INSIDE_LON), false);
  assert.equal(isWithinOperatingRegion(maxLat + 0.0001, INSIDE_LON), false);
  assert.equal(isWithinOperatingRegion(INSIDE_LAT, minLon - 0.0001), false);
  assert.equal(isWithinOperatingRegion(INSIDE_LAT, maxLon + 0.0001), false);
});

test("isWithinOperatingRegion: clearly distant coordinates are out", () => {
  // New York City — well outside California.
  assert.equal(isWithinOperatingRegion(40.7, -74.0), false);
});

// ===== getLocationIssues: coordinate issues =====

test("getLocationIssues: a complete pickup has no issues", () => {
  assert.deepEqual(
    codesOf({
      role: "pickup",
      lat: INSIDE_LAT,
      lon: INSIDE_LON,
      default_units_loaded: 180,
    }),
    [],
  );
});

test("getLocationIssues: missing coordinates are flagged", () => {
  const codes = codesOf({
    role: "dropoff",
    lat: undefined,
    lon: undefined,
  });
  assert.ok(codes.includes("missing_coordinates"));
});

test("getLocationIssues: the 0,0 null island is flagged as missing coordinates", () => {
  const codes = codesOf({ role: "dropoff", lat: 0, lon: 0 });
  assert.ok(codes.includes("missing_coordinates"));
});

test("getLocationIssues: out-of-region coordinates are flagged", () => {
  const codes = codesOf({ role: "dropoff", lat: 40.7, lon: -74.0 });
  assert.deepEqual(codes, ["out_of_region"]);
});

test("getLocationIssues: missing coordinates suppress the out-of-region check", () => {
  // out_of_region is an else-if branch, so it must not appear when coords are missing.
  const codes = codesOf({ role: "dropoff", lat: undefined, lon: undefined });
  assert.ok(codes.includes("missing_coordinates"));
  assert.ok(!codes.includes("out_of_region"));
});

// ===== getLocationIssues: load-size rule by role =====

test("getLocationIssues: a pickup with no load size is flagged", () => {
  const codes = codesOf({ role: "pickup", lat: INSIDE_LAT, lon: INSIDE_LON });
  assert.deepEqual(codes, ["missing_load_size"]);
});

test("getLocationIssues: a 'both' role with no load size is flagged", () => {
  const codes = codesOf({ role: "both", lat: INSIDE_LAT, lon: INSIDE_LON });
  assert.deepEqual(codes, ["missing_load_size"]);
});

test("getLocationIssues: a pickup with a zero load size is flagged", () => {
  const codes = codesOf({
    role: "pickup",
    lat: INSIDE_LAT,
    lon: INSIDE_LON,
    default_units_loaded: 0,
  });
  assert.deepEqual(codes, ["missing_load_size"]);
});

test("getLocationIssues: a pickup with a negative load size is flagged", () => {
  const codes = codesOf({
    role: "pickup",
    lat: INSIDE_LAT,
    lon: INSIDE_LON,
    default_units_loaded: -5,
  });
  assert.deepEqual(codes, ["missing_load_size"]);
});

test("getLocationIssues: a dropoff with no load size is not flagged", () => {
  // Dropoffs don't load product, so they need no default load size.
  const codes = codesOf({ role: "dropoff", lat: INSIDE_LAT, lon: INSIDE_LON });
  assert.deepEqual(codes, []);
});

test("getLocationIssues: a yard with no load size is not flagged", () => {
  const codes = codesOf({ role: "yard", lat: INSIDE_LAT, lon: INSIDE_LON });
  assert.deepEqual(codes, []);
});

test("getLocationIssues: a base-yard pickup is exempt from the load-size rule", () => {
  // is_base_yard exempts a pickup/both role from needing a load size.
  const codes = codesOf({
    role: "pickup",
    lat: INSIDE_LAT,
    lon: INSIDE_LON,
    is_base_yard: true,
  });
  assert.deepEqual(codes, []);
});

test("getLocationIssues: a pickup can have both coordinate and load-size issues", () => {
  const codes = codesOf({
    role: "pickup",
    lat: undefined,
    lon: undefined,
  });
  assert.ok(codes.includes("missing_coordinates"));
  assert.ok(codes.includes("missing_load_size"));
  assert.equal(codes.length, 2);
});

// ===== hasLocationIssues =====

test("hasLocationIssues: true when there is at least one issue", () => {
  assert.equal(
    hasLocationIssues({ role: "pickup", lat: INSIDE_LAT, lon: INSIDE_LON }),
    true,
  );
});

test("hasLocationIssues: false when the record is complete", () => {
  assert.equal(
    hasLocationIssues({
      role: "pickup",
      lat: INSIDE_LAT,
      lon: INSIDE_LON,
      default_units_loaded: 180,
    }),
    false,
  );
});
