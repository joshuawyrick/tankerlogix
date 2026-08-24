/**
 * Typed interfaces for map data objects passed to route map components.
 * These replace the previous `data: any` props to surface missing-field bugs
 * in development rather than silently producing a blank or wrong overlay.
 */

export interface RouteCalculation {
  id: string;
  polyline?: string;
  summary?: string;
  route_summary?: string;
  distance_miles: number;
  total_miles: number;
  total_time_hr: number;
  rate_per_unit: number;
  /** Coordinates present on individual calc entries (batch fallback) */
  pickup_lat?: number;
  pickup_lon?: number;
  dropoff_lat?: number;
  dropoff_lon?: number;
}

export interface LocationCoords {
  lat: number;
  lon: number;
}

export interface MapData {
  /** Required: determines rate label ("gallon" / "barrel") */
  load_type: string;
  /** Required: at least one route to display */
  calculations: RouteCalculation[];

  // --- Regular (single-pair) mode ---
  /** Human-readable names shown on markers */
  pickup?: string;
  dropoff?: string;
  pickup_name?: string;
  dropoff_name?: string;
  /** Location id → coords map used by regular mode */
  locations?: Record<string, LocationCoords>;
  pickup_location_id?: string;
  dropoff_location_id?: string;

  // --- Batch mode (coordinates supplied directly) ---
  pickup_lat?: number;
  pickup_lon?: number;
  dropoff_lat?: number;
  dropoff_lon?: number;

  // --- Deadhead extension ---
  include_deadhead?: boolean;
  base_lat?: number;
  base_lon?: number;

  /**
   * Original calculation request parameters. When present, the map enables
   * Google-Maps-style route dragging and uses these to re-run the rate engine
   * server-side for the dragged route.
   */
  request?: Record<string, any>;
}

/**
 * Validates a MapData object in development and logs actionable errors for any
 * missing required fields.  Safe no-op in production.
 */
export function validateMapData(data: MapData, context = "MapData"): void {
  if (process.env.NODE_ENV === "production") return;

  const errors: string[] = [];

  if (!data.load_type) {
    errors.push(`${context}: missing required field "load_type" — rate labels will be wrong`);
  }

  if (!Array.isArray(data.calculations) || data.calculations.length === 0) {
    errors.push(`${context}: "calculations" must be a non-empty array`);
  } else {
    data.calculations.forEach((calc, i) => {
      const prefix = `${context}.calculations[${i}]`;
      if (calc.id === undefined) errors.push(`${prefix}: missing "id"`);
      if (calc.distance_miles === undefined) errors.push(`${prefix}: missing "distance_miles"`);
      if (calc.total_miles === undefined) errors.push(`${prefix}: missing "total_miles"`);
      if (calc.total_time_hr === undefined) errors.push(`${prefix}: missing "total_time_hr"`);
      if (calc.rate_per_unit === undefined) errors.push(`${prefix}: missing "rate_per_unit"`);
    });
  }

  // Coordinate availability check: at least one of the three strategies must work
  const hasBatchCoords =
    data.pickup_lat !== undefined &&
    data.pickup_lon !== undefined &&
    data.dropoff_lat !== undefined &&
    data.dropoff_lon !== undefined;

  const hasLocationMap =
    data.locations !== undefined &&
    data.pickup_location_id !== undefined &&
    data.dropoff_location_id !== undefined;

  const hasCalcCoords =
    Array.isArray(data.calculations) &&
    data.calculations.length > 0 &&
    data.calculations[0].pickup_lat !== undefined &&
    data.calculations[0].dropoff_lat !== undefined;

  if (!hasBatchCoords && !hasLocationMap && !hasCalcCoords) {
    errors.push(
      `${context}: no coordinate source found — provide one of: ` +
        "(a) pickup_lat/lon + dropoff_lat/lon, " +
        "(b) locations + pickup_location_id + dropoff_location_id, or " +
        "(c) pickup_lat/lon + dropoff_lat/lon on calculations[0]"
    );
  }

  if (errors.length > 0) {
    console.error(
      "[map-data validation] Required fields are missing — the map overlay may go blank or display incorrect data:\n" +
        errors.map((e) => `  • ${e}`).join("\n")
    );
  }
}
