import type { Location } from "./schema";

// Operating-region bounding box used to flag coordinates that fall far outside
// the Kern County operating area (likely data-entry typos, e.g. a wrong sign or
// transposed lat/lon). These bounds cover California, matching the guidance shown
// in the spreadsheet column mapper. Out-of-region coordinates are flagged as a
// warning, never hard-blocked, so unusual-but-intentional locations can still be saved.
export const OPERATING_REGION = {
  minLat: 32.0,
  maxLat: 42.0,
  minLon: -125.0,
  maxLon: -114.0,
  label: "California operating area",
};

export type LocationIssueCode =
  | "missing_coordinates"
  | "out_of_region"
  | "missing_load_size";

export interface LocationIssue {
  code: LocationIssueCode;
  label: string; // short label for badges
  message: string; // friendly, user-facing explanation
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

// A location can be used in route calculations only when it has real coordinates.
// Treat null/undefined/NaN and the 0,0 "null island" as missing.
export function hasValidCoordinates(
  loc: Pick<Location, "lat" | "lon">,
): boolean {
  return (
    isFiniteNumber(loc.lat) &&
    isFiniteNumber(loc.lon) &&
    !(loc.lat === 0 && loc.lon === 0)
  );
}

export function isWithinOperatingRegion(lat: number, lon: number): boolean {
  return (
    lat >= OPERATING_REGION.minLat &&
    lat <= OPERATING_REGION.maxLat &&
    lon >= OPERATING_REGION.minLon &&
    lon <= OPERATING_REGION.maxLon
  );
}

// Only roles that actually load product need a default load size.
function roleLoadsProduct(role: string | undefined): boolean {
  return role === "pickup" || role === "both";
}

// Returns the list of data-quality issues for a location. An empty array means
// the record is complete. This is the single source of truth for both the
// frontend (flags/filter/entry warnings) and the backend (import warnings).
export function getLocationIssues(
  loc: Partial<Location> & { role?: Location["role"] },
): LocationIssue[] {
  const issues: LocationIssue[] = [];

  const validCoords = hasValidCoordinates({
    lat: loc.lat as number,
    lon: loc.lon as number,
  });

  if (!validCoords) {
    issues.push({
      code: "missing_coordinates",
      label: "No coordinates",
      message:
        "This location has no GPS coordinates and can't be used in route calculations.",
    });
  } else if (!isWithinOperatingRegion(loc.lat as number, loc.lon as number)) {
    issues.push({
      code: "out_of_region",
      label: "Outside region",
      message: `Coordinates fall outside the expected ${OPERATING_REGION.label} — they may be a typo.`,
    });
  }

  // Yards never load product, so they don't need a default load size.
  if (roleLoadsProduct(loc.role) && !loc.is_base_yard) {
    if (
      !isFiniteNumber(loc.default_units_loaded) ||
      (loc.default_units_loaded as number) <= 0
    ) {
      issues.push({
        code: "missing_load_size",
        label: "No load size",
        message:
          "This pickup location has no default load size set, so batch calculations will fall back to a generic amount.",
      });
    }
  }

  return issues;
}

export function hasLocationIssues(
  loc: Partial<Location> & { role?: Location["role"] },
): boolean {
  return getLocationIssues(loc).length > 0;
}
