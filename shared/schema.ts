import { z } from "zod";
import { pgTable, varchar, text, integer, boolean, real, timestamp, jsonb, pgEnum, serial, bigint, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ===== DRIZZLE DATABASE TABLES =====

// Database enums
export const roleEnum = pgEnum('role', ['pickup', 'dropoff', 'both', 'yard']);
export const productTypeEnum = pgEnum('product_type', ['crude', 'diesel', 'both']);
export const rateTypeEnum = pgEnum('rate_type', ['per_barrel', 'per_gallon', 'flat_rate']);
export const shiftStatusEnum = pgEnum('shift_status', ['planned', 'in_progress', 'completed']);
export const deadheadTypeEnum = pgEnum('deadhead_type', ['none', 'oneway', 'portaltoportal', 'roundtrip']);

// Locations table
export const locationsTable = pgTable('locations', {
  location_id: varchar('location_id').primaryKey(),
  name: varchar('name').notNull(),
  role: roleEnum('role').notNull(),
  lat: real('lat'),
  lon: real('lon'),
  allowed_load_types: varchar('allowed_load_types').default('crude,diesel'),
  default_units_loaded: integer('default_units_loaded'),
  default_pickup_min: integer('default_pickup_min'),
  default_dropoff_min: integer('default_dropoff_min'),
  pickup_queue_min: integer('pickup_queue_min'),
  dropoff_queue_min: integer('dropoff_queue_min'),
  api_gravity: real('api_gravity'),
  avg_speed: real('avg_speed'),
  notes: text('notes'),
  is_base_yard: boolean('is_base_yard').default(false),
}, (table) => [
  index('locations_role_idx').on(table.role),
]);

// Config table (single row)
export const configTable = pgTable('config', {
  id: serial('id').primaryKey(),
  avg_mph_default: real('avg_mph_default').default(41),
  hourly_target_default_usd: real('hourly_target_default_usd').default(135),
  traffic_buffer_min_default: integer('traffic_buffer_min_default').default(20),
  pickup_time_min_default: integer('pickup_time_min_default').default(45),
  dropoff_time_min_default: integer('dropoff_time_min_default').default(60),
  include_deadhead_default: boolean('include_deadhead_default').default(true),
  assume_symmetric_route_for_empty: boolean('assume_symmetric_route_for_empty').default(true),
  base_yard_name: varchar('base_yard_name').default('Yard'),
  base_lat: real('base_lat').default(35.3),
  base_lon: real('base_lon').default(-119.1),
  diesel_units_are_gallons: boolean('diesel_units_are_gallons').default(true),
  crude_units_are_barrels: boolean('crude_units_are_barrels').default(true),
  barrels_to_gallons_factor: real('barrels_to_gallons_factor').default(42),
  admin_pin: varchar('admin_pin', { length: 10 }),
  pin_enabled: boolean('pin_enabled').default(false),
});

// Route overrides table
export const routeOverridesTable = pgTable('route_overrides', {
  id: serial('id').primaryKey(),
  pickup_location_id: varchar('pickup_location_id').notNull(),
  dropoff_location_id: varchar('dropoff_location_id').notNull(),
  mph_override: real('mph_override'),
  default_units_loaded_override: integer('default_units_loaded_override'),
  notes: text('notes'),
}, (table) => [
  index('route_overrides_pickup_dropoff_idx').on(table.pickup_location_id, table.dropoff_location_id),
]);

// Route cache table
export const routeCacheTable = pgTable('route_cache', {
  cache_key: varchar('cache_key').primaryKey(),
  routes: jsonb('routes').notNull(),
  created_at: timestamp('created_at').defaultNow(),
});

// Customers table
export const customersTable = pgTable('customers', {
  customer_id: varchar('customer_id').primaryKey().default(sql`'CUST_' || substr(gen_random_uuid()::text, 1, 8)`),
  customer_name: varchar('customer_name').notNull(),
  customer_code: varchar('customer_code').notNull().unique(),
  notes: text('notes'),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});

// Contracted routes table
export const contractedRoutesTable = pgTable('contracted_routes', {
  route_id: varchar('route_id').primaryKey().default(sql`'ROUTE_' || substr(gen_random_uuid()::text, 1, 8)`),
  route_name: varchar('route_name').notNull(),
  customer_id: varchar('customer_id'),
  pickup_location_id: varchar('pickup_location_id').notNull(),
  dropoff_location_id: varchar('dropoff_location_id').notNull(),
  product_type: productTypeEnum('product_type').notNull(),
  avg_volume: real('avg_volume').notNull(),
  rate_per_unit: real('rate_per_unit').notNull(),
  rate_type: rateTypeEnum('rate_type').notNull(),
  avg_pickup_time: integer('avg_pickup_time'),
  avg_dropoff_time: integer('avg_dropoff_time'),
  avg_speed: real('avg_speed'),
  notes: text('notes'),
  // Saved custom (dragged) route support: when set, this contracted route
  // carries a user-customized path that can be reused in calculations.
  is_custom: boolean('is_custom').default(false),
  custom_miles: real('custom_miles'),
  custom_polyline: text('custom_polyline'),
}, (table) => [
  index('contracted_routes_customer_id_idx').on(table.customer_id),
]);

// Shifts table
export const shiftsTable = pgTable('shifts', {
  shift_id: varchar('shift_id').primaryKey().default(sql`'SHIFT_' || substr(gen_random_uuid()::text, 1, 8)`),
  name: varchar('name').notNull(),
  shift_date: varchar('shift_date').notNull(),
  status: shiftStatusEnum('status').default('planned'),
  start_yard_id: varchar('start_yard_id'),
  end_yard_id: varchar('end_yard_id'),
  target_hourly_rate_usd: real('target_hourly_rate_usd'),
  travel_speed_mph: real('travel_speed_mph'),
  traffic_buffer_min: integer('traffic_buffer_min'),
  total_revenue: real('total_revenue'),
  total_drive_time_hours: real('total_drive_time_hours'),
  total_work_time_hours: real('total_work_time_hours'),
  total_miles: real('total_miles'),
  effective_hourly_rate: real('effective_hourly_rate'),
  deadhead_start_miles: real('deadhead_start_miles'),
  deadhead_return_miles: real('deadhead_return_miles'),
  segment_details: jsonb('segment_details'),
  notes: text('notes'),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});

// Route templates table
export const routeTemplatesTable = pgTable('route_templates', {
  template_id: varchar('template_id').primaryKey().default(sql`'TEMPLATE_' || substr(gen_random_uuid()::text, 1, 8)`),
  template_name: varchar('template_name').notNull(),
  from_location_id: varchar('from_location_id').notNull(),
  to_location_id: varchar('to_location_id').notNull(),
  distance_miles: real('distance_miles').notNull(),
  drive_time_minutes: integer('drive_time_minutes').notNull(),
  route_description: text('route_description').notNull(),
  is_active: boolean('is_active').default(true),
  notes: text('notes'),
  created_at: bigint('created_at', { mode: 'number' }).notNull(),
});

// Shift loads table
export const shiftLoadsTable = pgTable('shift_loads', {
  load_id: varchar('load_id').primaryKey().default(sql`'LOAD_' || substr(gen_random_uuid()::text, 1, 8)`),
  shift_id: varchar('shift_id').notNull(),
  load_order: integer('load_order').notNull(),
  customer_id: varchar('customer_id'),
  pickup_location_id: varchar('pickup_location_id').notNull(),
  dropoff_location_id: varchar('dropoff_location_id').notNull(),
  pickup_location_name: varchar('pickup_location_name'),
  dropoff_location_name: varchar('dropoff_location_name'),
  contracted_route_id: varchar('contracted_route_id'),
  route_template_id: varchar('route_template_id'),
  product_type: productTypeEnum('product_type').notNull(),
  volume: real('volume').notNull(),
  rate_per_unit: real('rate_per_unit').notNull(),
  rate_type: rateTypeEnum('rate_type').notNull(),
  pickup_time_min: integer('pickup_time_min'),
  dropoff_time_min: integer('dropoff_time_min'),
  avg_speed: real('avg_speed').notNull(),
  deadhead_miles: real('deadhead_miles'),
  loaded_miles: real('loaded_miles'),
  total_miles: real('total_miles'),
  drive_time_hours: real('drive_time_hours'),
  total_time_hours: real('total_time_hours'),
  revenue: real('revenue'),
  effective_rate_per_hour: real('effective_rate_per_hour'),
  route_segments: jsonb('route_segments'),
  calculation_results: jsonb('calculation_results'),
  notes: text('notes'),
}, (table) => [
  index('shift_loads_shift_id_idx').on(table.shift_id),
  index('shift_loads_customer_id_idx').on(table.customer_id),
]);

// ===== ZOD SCHEMAS (KEEP EXISTING) =====

// Location schema
export const locationSchema = z.object({
  location_id: z.string(),
  name: z.string(),
  role: z.enum(["pickup", "dropoff", "both", "yard"]),
  lat: z.number(), // No geographic restrictions
  lon: z.number(), // No geographic restrictions  
  allowed_load_types: z.string(), // "crude|diesel|crude,diesel"
  default_units_loaded: z.number().optional(),
  default_pickup_min: z.number().optional(),
  default_dropoff_min: z.number().optional(),
  pickup_queue_min: z.number().optional(),
  dropoff_queue_min: z.number().optional(),
  api_gravity: z.number().optional(),
  avg_speed: z.number().optional(), // Default average speed in mph for this location
  notes: z.string().optional(),
  is_base_yard: z.boolean().optional(),
});

export const insertLocationSchema = locationSchema.partial({
  location_id: true, // Auto-generated if not provided
  lat: true, // Optional for uploads  
  lon: true, // Optional for uploads
});

// Configuration schema
export const configSchema = z.object({
  avg_mph_default: z.number().default(41),
  hourly_target_default_usd: z.number().default(135),
  traffic_buffer_min_default: z.number().default(20),
  pickup_time_min_default: z.number().default(45),
  dropoff_time_min_default: z.number().default(60),
  include_deadhead_default: z.boolean().default(true),
  assume_symmetric_route_for_empty: z.boolean().default(true),
  base_yard_name: z.string().default("Yard"),
  base_lat: z.number().default(35.3),
  base_lon: z.number().default(-119.1),
  diesel_units_are_gallons: z.boolean().default(true),
  crude_units_are_barrels: z.boolean().default(true),
  barrels_to_gallons_factor: z.number().default(42),
  admin_pin: z.string().max(10).optional(),
  pin_enabled: z.boolean().default(false),
});

// Route override schema
export const routeOverrideSchema = z.object({
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  mph_override: z.number().optional(),
  default_units_loaded_override: z.number().optional(),
  notes: z.string().optional(),
});

// Route cache schema
export const routeCacheSchema = z.object({
  created_at: z.number(),
  routes: z.array(z.object({
    id: z.string(),
    summary: z.string(),
    miles: z.number(),
    polyline: z.string(),
  })),
});

// Scenario schema
export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  load_type: z.enum(["crude", "diesel"]),
  units_loaded: z.number(),
  avg_mph: z.number(),
  pickup_time_min: z.number(),
  dropoff_time_min: z.number(),
  traffic_buffer_min: z.number(),
  hourly_target_usd: z.number(),
  include_deadhead: z.boolean(),
  deadhead_type: z.enum(["none", "oneway", "portaltoportal", "roundtrip"]).default("portaltoportal"),
  assume_symmetric_route: z.boolean(),
  selected_route_id: z.string().optional(),
  created_at: z.number(),
});

// Customer schema
export const customerSchema = z.object({
  customer_id: z.string(),
  customer_name: z.string(),
  customer_code: z.string(), // Short code for quick identification
  notes: z.string().optional(),
  created_at: z.number(),
});

export const insertCustomerSchema = customerSchema.omit({
  customer_id: true, // Auto-generated
  created_at: true, // Auto-generated
});

// Contracted Route schema
export const contractedRouteSchema = z.object({
  route_id: z.string(),
  route_name: z.string(),
  customer_id: z.string().optional(), // Link to customer (nullable for N/A)
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  product_type: z.enum(["crude", "diesel", "both"]),
  avg_volume: z.number(),
  rate_per_unit: z.number(),
  rate_type: z.enum(["per_barrel", "per_gallon", "flat_rate"]),
  avg_pickup_time: z.number().optional(),
  avg_dropoff_time: z.number().optional(),
  avg_speed: z.number().optional(),
  notes: z.string().optional(),
  // Saved custom (dragged) route fields
  is_custom: z.boolean().optional(),
  custom_miles: z.number().positive().optional(),
  custom_polyline: z.string().optional(),
});

export const insertContractedRouteSchema = contractedRouteSchema.omit({
  route_id: true, // Auto-generated
});

// Calculation request schema
export const calculationRequestSchema = z.object({
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  load_type: z.enum(["crude", "diesel"]),
  units_loaded: z.number().positive(),
  avg_mph: z.number().positive(),
  pickup_time_min: z.number().min(0),
  dropoff_time_min: z.number().min(0),
  traffic_buffer_min: z.number().min(0),
  hourly_target_usd: z.number().positive(),
  include_deadhead: z.boolean(),
  deadhead_type: z.enum(["none", "oneway", "portaltoportal", "roundtrip"]).default("portaltoportal"),
  assume_symmetric_route: z.boolean(),
  base_yard_id: z.string().optional(),
});

// Route request schema for Google Maps API
export const routeRequestSchema = z.object({
  origin: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  destination: z.object({
    lat: z.number(),
    lon: z.number(),
  }),
  waypoints: z.array(z.object({
    lat: z.number(),
    lon: z.number(),
  })).optional(),
  avoid: z.object({
    tolls: z.boolean().optional(),
    ferries: z.boolean().optional(),
  }).optional(),
  alternatives: z.boolean().default(true),
});

// Shift schema
export const shiftSchema = z.object({
  shift_id: z.string(),
  name: z.string(),
  shift_date: z.string(), // ISO date string
  status: z.enum(["planned", "in_progress", "completed"]).default("planned"),
  start_yard_id: z.string().optional(), // Yard where the truck starts the shift
  end_yard_id: z.string().optional(), // Yard where the truck returns at the end of the shift
  target_hourly_rate_usd: z.number().optional(), // Target hourly earnings rate
  travel_speed_mph: z.number().optional(), // Travel speed used for calculations
  traffic_buffer_min: z.number().optional(), // Traffic buffer time added
  total_revenue: z.number().optional(), // Calculated field
  total_drive_time_hours: z.number().optional(), // Calculated field
  total_work_time_hours: z.number().optional(), // Calculated field
  total_miles: z.number().optional(), // Calculated field
  effective_hourly_rate: z.number().optional(), // Calculated field
  deadhead_start_miles: z.number().optional(), // Deadhead from base to first pickup
  deadhead_return_miles: z.number().optional(), // Deadhead from last drop to base
  segment_details: z.any().optional(), // JSON object with all segment details
  notes: z.string().optional(),
  created_at: z.number(),
});

export const insertShiftSchema = shiftSchema.omit({
  shift_id: true, // Auto-generated
  created_at: true, // Auto-generated
  total_revenue: true, // Calculated
  total_drive_time_hours: true, // Calculated
  total_work_time_hours: true, // Calculated
  total_miles: true, // Calculated
  effective_hourly_rate: true, // Calculated
});

// Route Template schema - for saving preferred routes between locations
export const routeTemplateSchema = z.object({
  template_id: z.string(),
  template_name: z.string(), // e.g. "Mt Poso to Chemoil - Highway 99 Route"
  from_location_id: z.string(),
  to_location_id: z.string(),
  distance_miles: z.number().positive(),
  drive_time_minutes: z.number().positive(),
  route_description: z.string(), // Description of the route taken
  is_active: z.boolean().default(true),
  created_at: z.number(),
  notes: z.string().optional(),
});

export const insertRouteTemplateSchema = routeTemplateSchema.omit({
  template_id: true, // Auto-generated
  created_at: true, // Auto-generated
});

// Shift Load schema
export const shiftLoadSchema = z.object({
  load_id: z.string(),
  shift_id: z.string(),
  load_order: z.number().min(1).max(5), // 1-5 loads per shift
  customer_id: z.string().optional(), // Customer for this specific load
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  pickup_location_name: z.string().optional(), // Name for display
  dropoff_location_name: z.string().optional(), // Name for display
  contracted_route_id: z.string().optional(), // Link to contracted route if used
  route_template_id: z.string().optional(), // Link to route template if used
  product_type: z.enum(["crude", "diesel"]),
  volume: z.number().positive(),
  rate_per_unit: z.number(),
  rate_type: z.enum(["per_barrel", "per_gallon", "flat_rate"]),
  pickup_time_min: z.number().min(0),
  dropoff_time_min: z.number().min(0),
  avg_speed: z.number().positive(),
  // Calculated fields (filled by backend)
  drive_time_hours: z.number().optional(),
  work_time_hours: z.number().optional(),
  total_miles: z.number().optional(),
  load_revenue: z.number().optional(),
  selected_route_id: z.string().optional(), // Google Maps route choice
  notes: z.string().optional(),
});

export const insertShiftLoadSchema = shiftLoadSchema.omit({
  load_id: true, // Auto-generated
  drive_time_hours: true, // Calculated
  work_time_hours: true, // Calculated
  total_miles: true, // Calculated
  load_revenue: true, // Calculated
});

// Shift Load Input schema for calculations (no IDs, no calculated fields)
export const shiftLoadInputSchema = z.object({
  load_order: z.number().min(1).max(5), // 1-5 loads per shift
  customer_id: z.string().optional(), // Customer for this specific load
  pickup_location_id: z.string(),
  dropoff_location_id: z.string(),
  pickup_location_name: z.string().optional(),
  dropoff_location_name: z.string().optional(),
  contracted_route_id: z.string().optional(), // Link to contracted route if used
  route_template_id: z.string().optional(), // Link to route template if used
  product_type: z.enum(["crude", "diesel"]),
  volume: z.number().positive(),
  rate_per_unit: z.number(),
  rate_type: z.enum(["per_barrel", "per_gallon", "flat_rate"]),
  pickup_time_min: z.number().min(0),
  dropoff_time_min: z.number().min(0),
  avg_speed: z.number().positive(),
  selected_route_id: z.string().optional(), // Google Maps route choice
  notes: z.string().optional(),
});

// Shift calculation request schema
export const shiftCalculationRequestSchema = z.object({
  shift_id: z.string().optional(), // Optional for pre-save calculations
  loads: z.array(shiftLoadInputSchema).min(1).max(5),
  include_deadhead: z.boolean().default(true),
  deadhead_type: z.enum(["none", "oneway", "portaltoportal", "roundtrip"]).default("portaltoportal"),
  base_yard_id: z.string().optional(),
  traffic_buffer_min: z.number().min(0).default(0),
  avg_mph: z.number().min(1).max(100).default(41), // User-configured travel speed
  target_hourly_rate: z.number().min(0).optional(), // Target earnings per hour
});

// Export types
export type Location = z.infer<typeof locationSchema>;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Config = z.infer<typeof configSchema>;
export type RouteOverride = z.infer<typeof routeOverrideSchema>;
export type RouteCache = z.infer<typeof routeCacheSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type ContractedRoute = z.infer<typeof contractedRouteSchema>;
export type InsertContractedRoute = z.infer<typeof insertContractedRouteSchema>;
export type RouteTemplate = z.infer<typeof routeTemplateSchema>;
export type InsertRouteTemplate = z.infer<typeof insertRouteTemplateSchema>;
export type Shift = z.infer<typeof shiftSchema>;
export type InsertShift = z.infer<typeof insertShiftSchema>;
export type ShiftLoad = z.infer<typeof shiftLoadSchema>;
export type InsertShiftLoad = z.infer<typeof insertShiftLoadSchema>;
export type ShiftLoadInput = z.infer<typeof shiftLoadInputSchema>;
export type ShiftCalculationRequest = z.infer<typeof shiftCalculationRequestSchema>;

// Insert schemas
export const insertScenarioSchema = scenarioSchema.omit({
  id: true,
  created_at: true,
});
export type CalculationRequest = z.infer<typeof calculationRequestSchema>;
export type RouteRequest = z.infer<typeof routeRequestSchema>;
