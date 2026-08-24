import type { 
  Location, 
  InsertLocation, 
  Config, 
  RouteOverride, 
  RouteCache,
  Customer,
  InsertCustomer,
  ContractedRoute,
  InsertContractedRoute,
  RouteTemplate,
  InsertRouteTemplate,
  Shift,
  InsertShift,
  ShiftLoad,
  InsertShiftLoad
} from '@shared/schema';
import { randomUUID } from 'crypto';
import { db } from './db';
import { 
  locationsTable,
  configTable,
  routeOverridesTable,
  routeCacheTable,
  customersTable,
  contractedRoutesTable,
  shiftsTable,
  shiftLoadsTable,
  routeTemplatesTable
} from '@shared/schema';
import { eq, and, inArray, isNotNull, sql } from 'drizzle-orm';

/**
 * One-time, idempotent backfill: rows written before the boolean-decode fix
 * in server/db.ts may hold an incorrect stored is_custom flag. custom_miles
 * was (and is) only ever populated for custom routes, so it is the reliable
 * source of truth for legacy rows. Runs at server startup in every
 * environment; the WHERE clause makes it a no-op once rows are aligned.
 */
export async function backfillContractedRouteIsCustom(): Promise<void> {
  await db.execute(sql`
    UPDATE contracted_routes
    SET is_custom = (custom_miles IS NOT NULL)
    WHERE is_custom IS DISTINCT FROM (custom_miles IS NOT NULL)
  `);
}

export interface IStorage {
  // Locations
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(location: InsertLocation): Promise<Location>;
  updateLocation(id: string, location: Partial<Location>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<void>;
  deleteLocationsBulk(ids: string[]): Promise<{ deleted: number }>;
  deleteLocationsByRole(role: 'pickup' | 'dropoff' | 'both' | 'yard'): Promise<{ deleted: number }>;
  
  // Config
  getConfig(): Promise<Config>;
  updateConfig(config: Partial<Config>): Promise<Config>;
  
  // Route overrides
  getRouteOverrides(): Promise<RouteOverride[]>;
  createRouteOverride(override: RouteOverride): Promise<RouteOverride>;
  updateRouteOverride(pickupId: string, dropoffId: string, override: Partial<RouteOverride>): Promise<RouteOverride>;
  deleteRouteOverride(pickupId: string, dropoffId: string): Promise<void>;
  
  // Route cache
  getRouteCache(key: string): Promise<RouteCache | undefined>;
  setRouteCache(key: string, cache: RouteCache): Promise<void>;
  
  // Customers
  getCustomers(): Promise<Customer[]>;
  getCustomer(customer_id: string): Promise<Customer | null>;
  createCustomer(customer: InsertCustomer): Promise<Customer>;
  updateCustomer(customer_id: string, customer: Partial<InsertCustomer>): Promise<Customer>;
  deleteCustomer(customer_id: string): Promise<boolean>;
  deleteCustomersBulk(ids: string[]): Promise<number>;
  
  // Contracted Routes
  getContractedRoutes(): Promise<ContractedRoute[]>;
  getContractedRoute(route_id: string): Promise<ContractedRoute | null>;
  createContractedRoute(route: InsertContractedRoute): Promise<ContractedRoute>;
  updateContractedRoute(route_id: string, route: Partial<InsertContractedRoute>): Promise<ContractedRoute>;
  deleteContractedRoute(route_id: string): Promise<boolean>;
  deleteContractedRoutesBulk(ids: string[]): Promise<number>;
  
  // Shifts
  getShifts(): Promise<Shift[]>;
  getShift(shift_id: string): Promise<Shift | null>;
  createShift(shift: InsertShift): Promise<Shift>;
  updateShift(shift_id: string, shift: Partial<Shift>): Promise<Shift>;
  deleteShift(shift_id: string): Promise<boolean>;
  deleteShiftsBulk(ids: string[]): Promise<number>;
  
  // Shift Loads
  getShiftLoads(shift_id: string): Promise<ShiftLoad[]>;
  getShiftLoad(load_id: string): Promise<ShiftLoad | null>;
  createShiftLoad(load: InsertShiftLoad): Promise<ShiftLoad>;
  updateShiftLoad(load_id: string, load: Partial<InsertShiftLoad>): Promise<ShiftLoad>;
  deleteShiftLoad(load_id: string): Promise<boolean>;
  deleteShiftLoadsBulk(ids: string[]): Promise<number>;
  
  // Route Templates
  getRouteTemplates(): Promise<RouteTemplate[]>;
  getRouteTemplate(template_id: string): Promise<RouteTemplate | null>;
  createRouteTemplate(template: InsertRouteTemplate): Promise<RouteTemplate>;
  updateRouteTemplate(template_id: string, template: Partial<InsertRouteTemplate>): Promise<RouteTemplate>;
  deleteRouteTemplate(template_id: string): Promise<boolean>;
  deleteRouteTemplatesBulk(ids: string[]): Promise<number>;
}


let configCache: Config | null = null;
const CONFIG_CACHE_TTL = 60000;
let configCacheTime = 0;

export class DatabaseStorage implements IStorage {
  // Locations
  async getLocations(): Promise<Location[]> {
    // Filter null lat/lon in the database query for better performance
    const locations = await db.select().from(locationsTable)
      .where(and(isNotNull(locationsTable.lat), isNotNull(locationsTable.lon)));
    
    return locations.map(loc => ({
      location_id: loc.location_id,
      name: loc.name,
      role: loc.role as 'pickup' | 'dropoff' | 'both' | 'yard',
      lat: loc.lat as number,
      lon: loc.lon as number,
      allowed_load_types: loc.allowed_load_types ?? 'crude,diesel',
      default_units_loaded: loc.default_units_loaded ?? undefined,
      default_pickup_min: loc.default_pickup_min ?? undefined,
      default_dropoff_min: loc.default_dropoff_min ?? undefined,
      pickup_queue_min: loc.pickup_queue_min ?? undefined,
      dropoff_queue_min: loc.dropoff_queue_min ?? undefined,
      api_gravity: loc.api_gravity ?? undefined,
      avg_speed: loc.avg_speed ?? undefined,
      notes: loc.notes ?? undefined,
      is_base_yard: loc.is_base_yard ?? false
    }));
  }

  async getLocation(id: string): Promise<Location | undefined> {
    const [location] = await db.select().from(locationsTable).where(eq(locationsTable.location_id, id));
    if (!location || location.lat === null || location.lon === null) return undefined;
    
    return {
      location_id: location.location_id,
      name: location.name,
      role: location.role as 'pickup' | 'dropoff' | 'both' | 'yard',
      lat: location.lat as number,
      lon: location.lon as number,
      allowed_load_types: location.allowed_load_types ?? 'crude,diesel',
      default_units_loaded: location.default_units_loaded ?? undefined,
      default_pickup_min: location.default_pickup_min ?? undefined,
      default_dropoff_min: location.default_dropoff_min ?? undefined,
      pickup_queue_min: location.pickup_queue_min ?? undefined,
      dropoff_queue_min: location.dropoff_queue_min ?? undefined,
      api_gravity: location.api_gravity ?? undefined,
      avg_speed: location.avg_speed ?? undefined,
      notes: location.notes ?? undefined,
      is_base_yard: location.is_base_yard ?? false
    };
  }

  async createLocation(location: InsertLocation): Promise<Location> {
    const locationId = generateLocationId(location.name);
    const newLocation = {
      ...location,
      location_id: locationId
    };
    
    await db.insert(locationsTable).values(newLocation);
    return this.getLocation(locationId) as Promise<Location>;
  }

  async updateLocation(id: string, updates: Partial<Location>): Promise<Location | undefined> {
    // Bail out cleanly if the record no longer exists so the route can return a
    // clear 404 instead of a confusing driver error.
    const existing = await this.getLocation(id);
    if (!existing) return undefined;

    await db.update(locationsTable)
      .set(updates)
      .where(eq(locationsTable.location_id, id));
    
    return this.getLocation(id);
  }

  async deleteLocation(id: string): Promise<void> {
    await db.delete(locationsTable).where(eq(locationsTable.location_id, id));
  }

  async deleteLocationsBulk(ids: string[]): Promise<{ deleted: number }> {
    if (ids.length === 0) {
      return { deleted: 0 };
    }
    
    const result = await db.delete(locationsTable)
      .where(inArray(locationsTable.location_id, ids));
    
    return { deleted: ids.length };
  }

  async deleteLocationsByRole(role: 'pickup' | 'dropoff' | 'both' | 'yard'): Promise<{ deleted: number }> {
    const locations = await db.select({ location_id: locationsTable.location_id })
      .from(locationsTable)
      .where(eq(locationsTable.role, role));
    
    if (locations.length > 0) {
      await db.delete(locationsTable).where(eq(locationsTable.role, role));
    }
    
    return { deleted: locations.length };
  }

  // Config (with caching for performance)
  async getConfig(): Promise<Config> {
    const now = Date.now();
    if (configCache && (now - configCacheTime) < CONFIG_CACHE_TTL) {
      return configCache;
    }

    const [config] = await db.select().from(configTable);
    
    if (!config) {
      const defaultConfig = {
        avg_mph_default: 41,
        hourly_target_default_usd: 135,
        traffic_buffer_min_default: 20,
        pickup_time_min_default: 45,
        dropoff_time_min_default: 60,
        include_deadhead_default: true,
        assume_symmetric_route_for_empty: true,
        base_yard_name: 'Yard',
        base_lat: 35.3,
        base_lon: -119.1,
        diesel_units_are_gallons: true,
        crude_units_are_barrels: true,
        barrels_to_gallons_factor: 42
      };
      
      await db.insert(configTable).values(defaultConfig);
      configCache = null;
      return this.getConfig();
    }
    
    const result = {
      avg_mph_default: config.avg_mph_default ?? 41,
      hourly_target_default_usd: config.hourly_target_default_usd ?? 135,
      traffic_buffer_min_default: config.traffic_buffer_min_default ?? 20,
      pickup_time_min_default: config.pickup_time_min_default ?? 45,
      dropoff_time_min_default: config.dropoff_time_min_default ?? 60,
      include_deadhead_default: config.include_deadhead_default ?? true,
      assume_symmetric_route_for_empty: config.assume_symmetric_route_for_empty ?? true,
      base_yard_name: config.base_yard_name ?? 'Yard',
      base_lat: config.base_lat ?? 35.3,
      base_lon: config.base_lon ?? -119.1,
      diesel_units_are_gallons: config.diesel_units_are_gallons ?? true,
      crude_units_are_barrels: config.crude_units_are_barrels ?? true,
      barrels_to_gallons_factor: config.barrels_to_gallons_factor ?? 42,
      admin_pin: config.admin_pin ?? undefined,
      pin_enabled: config.pin_enabled ?? false
    };
    
    configCache = result;
    configCacheTime = now;
    return result;
  }

  async updateConfig(updates: Partial<Config>): Promise<Config> {
    const [existing] = await db.select().from(configTable);
    
    if (!existing) {
      await db.insert(configTable).values(updates);
    } else {
      await db.update(configTable)
        .set(updates)
        .where(eq(configTable.id, existing.id));
    }
    
    configCache = null;
    return this.getConfig();
  }

  // Route overrides
  async getRouteOverrides(): Promise<RouteOverride[]> {
    const overrides = await db.select().from(routeOverridesTable);
    return overrides.map(o => ({
      pickup_location_id: o.pickup_location_id,
      dropoff_location_id: o.dropoff_location_id,
      mph_override: o.mph_override ?? undefined,
      default_units_loaded_override: o.default_units_loaded_override ?? undefined,
      notes: o.notes ?? undefined
    }));
  }

  async createRouteOverride(override: RouteOverride): Promise<RouteOverride> {
    await db.insert(routeOverridesTable).values(override);
    const [created] = await db.select().from(routeOverridesTable)
      .where(and(
        eq(routeOverridesTable.pickup_location_id, override.pickup_location_id),
        eq(routeOverridesTable.dropoff_location_id, override.dropoff_location_id)
      ));
    
    return {
      pickup_location_id: created.pickup_location_id,
      dropoff_location_id: created.dropoff_location_id,
      mph_override: created.mph_override ?? undefined,
      default_units_loaded_override: created.default_units_loaded_override ?? undefined,
      notes: created.notes ?? undefined
    };
  }

  async updateRouteOverride(pickupId: string, dropoffId: string, updates: Partial<RouteOverride>): Promise<RouteOverride> {
    await db.update(routeOverridesTable)
      .set(updates)
      .where(and(
        eq(routeOverridesTable.pickup_location_id, pickupId),
        eq(routeOverridesTable.dropoff_location_id, dropoffId)
      ));
    
    const [updated] = await db.select().from(routeOverridesTable)
      .where(and(
        eq(routeOverridesTable.pickup_location_id, pickupId),
        eq(routeOverridesTable.dropoff_location_id, dropoffId)
      ));
    
    return {
      pickup_location_id: updated.pickup_location_id,
      dropoff_location_id: updated.dropoff_location_id,
      mph_override: updated.mph_override ?? undefined,
      default_units_loaded_override: updated.default_units_loaded_override ?? undefined,
      notes: updated.notes ?? undefined
    };
  }

  async deleteRouteOverride(pickupId: string, dropoffId: string): Promise<void> {
    await db.delete(routeOverridesTable)
      .where(and(
        eq(routeOverridesTable.pickup_location_id, pickupId),
        eq(routeOverridesTable.dropoff_location_id, dropoffId)
      ));
  }

  // Route cache
  async getRouteCache(key: string): Promise<RouteCache | undefined> {
    const [cache] = await db.select().from(routeCacheTable)
      .where(eq(routeCacheTable.cache_key, key));
    
    if (!cache) return undefined;
    
    return {
      routes: cache.routes as any,
      created_at: cache.created_at?.getTime() ?? Date.now()
    };
  }

  async setRouteCache(key: string, cache: RouteCache): Promise<void> {
    await db.insert(routeCacheTable)
      .values({
        cache_key: key,
        routes: cache.routes
      })
      .onConflictDoUpdate({
        target: routeCacheTable.cache_key,
        set: {
          routes: cache.routes,
          created_at: new Date()
        }
      });
  }

  // Customers
  async getCustomers(): Promise<Customer[]> {
    const customers = await db.select().from(customersTable);
    return customers.map(c => ({
      customer_id: c.customer_id,
      customer_name: c.customer_name,
      customer_code: c.customer_code,
      notes: c.notes ?? undefined,
      created_at: c.created_at
    }));
  }

  async getCustomer(customer_id: string): Promise<Customer | null> {
    const [customer] = await db.select().from(customersTable)
      .where(eq(customersTable.customer_id, customer_id));
    
    if (!customer) return null;
    
    return {
      customer_id: customer.customer_id,
      customer_name: customer.customer_name,
      customer_code: customer.customer_code,
      notes: customer.notes ?? undefined,
      created_at: customer.created_at
    };
  }

  async createCustomer(customer: InsertCustomer): Promise<Customer> {
    const customerId = `CUST_${randomUUID().substring(0, 8).toUpperCase()}`;
    const newCustomer = {
      ...customer,
      customer_id: customerId,
      created_at: Date.now()
    };
    
    await db.insert(customersTable).values(newCustomer);
    return this.getCustomer(customerId) as Promise<Customer>;
  }

  async updateCustomer(customer_id: string, updates: Partial<InsertCustomer>): Promise<Customer> {
    await db.update(customersTable)
      .set(updates)
      .where(eq(customersTable.customer_id, customer_id));
    
    return this.getCustomer(customer_id) as Promise<Customer>;
  }

  async deleteCustomer(customer_id: string): Promise<boolean> {
    const result = await db.delete(customersTable)
      .where(eq(customersTable.customer_id, customer_id));
    
    return true;
  }

  async deleteCustomersBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    await db.delete(customersTable)
      .where(inArray(customersTable.customer_id, ids));
    
    return ids.length;
  }

  // Contracted Routes
  async getContractedRoutes(): Promise<ContractedRoute[]> {
    const routes = await db.select().from(contractedRoutesTable);
    return routes.map(r => ({
      route_id: r.route_id,
      route_name: r.route_name,
      customer_id: r.customer_id ?? undefined,
      pickup_location_id: r.pickup_location_id,
      dropoff_location_id: r.dropoff_location_id,
      product_type: r.product_type as 'crude' | 'diesel',
      avg_volume: r.avg_volume ?? 0,
      rate_per_unit: r.rate_per_unit ?? 0,
      rate_type: r.rate_type as 'per_barrel' | 'per_gallon' | 'flat_rate',
      avg_pickup_time: r.avg_pickup_time ?? undefined,
      avg_dropoff_time: r.avg_dropoff_time ?? undefined,
      avg_speed: r.avg_speed ?? undefined,
      notes: r.notes ?? undefined,
      is_custom: r.is_custom ?? undefined,
      custom_miles: r.custom_miles ?? undefined,
      custom_polyline: r.custom_polyline ?? undefined
    }));
  }

  async getContractedRoute(route_id: string): Promise<ContractedRoute | null> {
    const [route] = await db.select().from(contractedRoutesTable)
      .where(eq(contractedRoutesTable.route_id, route_id));
    
    if (!route) return null;
    
    return {
      route_id: route.route_id,
      route_name: route.route_name,
      customer_id: route.customer_id ?? undefined,
      pickup_location_id: route.pickup_location_id,
      dropoff_location_id: route.dropoff_location_id,
      product_type: route.product_type as 'crude' | 'diesel',
      avg_volume: route.avg_volume ?? 0,
      rate_per_unit: route.rate_per_unit ?? 0,
      rate_type: route.rate_type as 'per_barrel' | 'per_gallon' | 'flat_rate',
      avg_pickup_time: route.avg_pickup_time ?? undefined,
      avg_dropoff_time: route.avg_dropoff_time ?? undefined,
      avg_speed: route.avg_speed ?? undefined,
      notes: route.notes ?? undefined,
      is_custom: route.is_custom ?? undefined,
      custom_miles: route.custom_miles ?? undefined,
      custom_polyline: route.custom_polyline ?? undefined
    };
  }

  async createContractedRoute(route: InsertContractedRoute): Promise<ContractedRoute> {
    const routeId = `ROUTE_${randomUUID().substring(0, 8).toUpperCase()}`;
    const newRoute = {
      ...route,
      route_id: routeId
    };
    
    await db.insert(contractedRoutesTable).values(newRoute);
    return this.getContractedRoute(routeId) as Promise<ContractedRoute>;
  }

  async updateContractedRoute(route_id: string, updates: Partial<InsertContractedRoute>): Promise<ContractedRoute> {
    await db.update(contractedRoutesTable)
      .set(updates)
      .where(eq(contractedRoutesTable.route_id, route_id));
    
    return this.getContractedRoute(route_id) as Promise<ContractedRoute>;
  }

  async deleteContractedRoute(route_id: string): Promise<boolean> {
    await db.delete(contractedRoutesTable)
      .where(eq(contractedRoutesTable.route_id, route_id));
    
    return true;
  }

  async deleteContractedRoutesBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    await db.delete(contractedRoutesTable)
      .where(inArray(contractedRoutesTable.route_id, ids));
    
    return ids.length;
  }

  // Shifts
  async getShifts(): Promise<Shift[]> {
    const shifts = await db.select().from(shiftsTable);
    return shifts.map(s => ({
      shift_id: s.shift_id,
      name: s.name,
      shift_date: s.shift_date,
      status: s.status as 'planned' | 'in_progress' | 'completed',
      start_yard_id: s.start_yard_id ?? undefined,
      end_yard_id: s.end_yard_id ?? undefined,
      target_hourly_rate_usd: s.target_hourly_rate_usd ?? undefined,
      travel_speed_mph: s.travel_speed_mph ?? undefined,
      traffic_buffer_min: s.traffic_buffer_min ?? undefined,
      total_revenue: s.total_revenue ?? undefined,
      total_drive_time_hours: s.total_drive_time_hours ?? undefined,
      total_work_time_hours: s.total_work_time_hours ?? undefined,
      total_miles: s.total_miles ?? undefined,
      effective_hourly_rate: s.effective_hourly_rate ?? undefined,
      deadhead_start_miles: s.deadhead_start_miles ?? undefined,
      deadhead_return_miles: s.deadhead_return_miles ?? undefined,
      segment_details: s.segment_details as any,
      notes: s.notes ?? undefined,
      created_at: s.created_at
    }));
  }

  async getShift(shift_id: string): Promise<Shift | null> {
    const [shift] = await db.select().from(shiftsTable)
      .where(eq(shiftsTable.shift_id, shift_id));
    
    if (!shift) return null;
    
    return {
      shift_id: shift.shift_id,
      name: shift.name,
      shift_date: shift.shift_date,
      status: shift.status as 'planned' | 'in_progress' | 'completed',
      start_yard_id: shift.start_yard_id ?? undefined,
      end_yard_id: shift.end_yard_id ?? undefined,
      target_hourly_rate_usd: shift.target_hourly_rate_usd ?? undefined,
      travel_speed_mph: shift.travel_speed_mph ?? undefined,
      traffic_buffer_min: shift.traffic_buffer_min ?? undefined,
      total_revenue: shift.total_revenue ?? undefined,
      total_drive_time_hours: shift.total_drive_time_hours ?? undefined,
      total_work_time_hours: shift.total_work_time_hours ?? undefined,
      total_miles: shift.total_miles ?? undefined,
      effective_hourly_rate: shift.effective_hourly_rate ?? undefined,
      deadhead_start_miles: shift.deadhead_start_miles ?? undefined,
      deadhead_return_miles: shift.deadhead_return_miles ?? undefined,
      segment_details: shift.segment_details as any,
      notes: shift.notes ?? undefined,
      created_at: shift.created_at
    };
  }

  async createShift(shift: InsertShift): Promise<Shift> {
    const shiftId = `SHIFT_${randomUUID().substring(0, 8).toUpperCase()}`;
    const newShift = {
      ...shift,
      shift_id: shiftId,
      created_at: Date.now()
    };
    
    await db.insert(shiftsTable).values(newShift);
    return this.getShift(shiftId) as Promise<Shift>;
  }

  async updateShift(shift_id: string, updates: Partial<Shift>): Promise<Shift> {
    await db.update(shiftsTable)
      .set(updates)
      .where(eq(shiftsTable.shift_id, shift_id));
    
    return this.getShift(shift_id) as Promise<Shift>;
  }

  async deleteShift(shift_id: string): Promise<boolean> {
    // Delete associated loads first
    await db.delete(shiftLoadsTable)
      .where(eq(shiftLoadsTable.shift_id, shift_id));
    
    await db.delete(shiftsTable)
      .where(eq(shiftsTable.shift_id, shift_id));
    
    return true;
  }

  async deleteShiftsBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    // Delete associated loads first
    await db.delete(shiftLoadsTable)
      .where(inArray(shiftLoadsTable.shift_id, ids));
    
    await db.delete(shiftsTable)
      .where(inArray(shiftsTable.shift_id, ids));
    
    return ids.length;
  }

  // Shift Loads
  async getShiftLoads(shift_id: string): Promise<ShiftLoad[]> {
    const loads = await db.select().from(shiftLoadsTable)
      .where(eq(shiftLoadsTable.shift_id, shift_id));
    
    return loads.map(l => ({
      load_id: l.load_id,
      shift_id: l.shift_id,
      load_order: l.load_order,
      customer_id: l.customer_id ?? undefined,
      pickup_location_id: l.pickup_location_id,
      dropoff_location_id: l.dropoff_location_id,
      pickup_location_name: l.pickup_location_name ?? undefined,
      dropoff_location_name: l.dropoff_location_name ?? undefined,
      contracted_route_id: l.contracted_route_id ?? undefined,
      route_template_id: l.route_template_id ?? undefined,
      product_type: l.product_type as 'crude' | 'diesel',
      volume: l.volume ?? 0,
      rate_per_unit: l.rate_per_unit ?? 0,
      rate_type: l.rate_type as 'per_barrel' | 'per_gallon' | 'flat_rate',
      pickup_time_min: l.pickup_time_min ?? 0,
      dropoff_time_min: l.dropoff_time_min ?? 0,
      avg_speed: l.avg_speed ?? 41,
      drive_time_hours: l.drive_time_hours ?? undefined,
      work_time_hours: l.total_time_hours ?? undefined,
      total_miles: l.total_miles ?? undefined,
      load_revenue: l.revenue ?? undefined,
      selected_route_id: undefined,
      notes: l.notes ?? undefined
    }));
  }

  async getShiftLoad(load_id: string): Promise<ShiftLoad | null> {
    const [load] = await db.select().from(shiftLoadsTable)
      .where(eq(shiftLoadsTable.load_id, load_id));
    
    if (!load) return null;
    
    return {
      load_id: load.load_id,
      shift_id: load.shift_id,
      load_order: load.load_order,
      customer_id: load.customer_id ?? undefined,
      pickup_location_id: load.pickup_location_id,
      dropoff_location_id: load.dropoff_location_id,
      pickup_location_name: load.pickup_location_name ?? undefined,
      dropoff_location_name: load.dropoff_location_name ?? undefined,
      contracted_route_id: load.contracted_route_id ?? undefined,
      route_template_id: load.route_template_id ?? undefined,
      product_type: load.product_type as 'crude' | 'diesel',
      volume: load.volume ?? 0,
      rate_per_unit: load.rate_per_unit ?? 0,
      rate_type: load.rate_type as 'per_barrel' | 'per_gallon' | 'flat_rate',
      pickup_time_min: load.pickup_time_min ?? 0,
      dropoff_time_min: load.dropoff_time_min ?? 0,
      avg_speed: load.avg_speed ?? 41,
      drive_time_hours: load.drive_time_hours ?? undefined,
      work_time_hours: load.total_time_hours ?? undefined,
      total_miles: load.total_miles ?? undefined,
      load_revenue: load.revenue ?? undefined,
      selected_route_id: undefined,
      notes: load.notes ?? undefined
    };
  }

  async createShiftLoad(load: InsertShiftLoad): Promise<ShiftLoad> {
    const loadId = `LOAD_${randomUUID().substring(0, 8).toUpperCase()}`;
    const newLoad = {
      ...load,
      load_id: loadId
    };
    
    await db.insert(shiftLoadsTable).values(newLoad);
    return this.getShiftLoad(loadId) as Promise<ShiftLoad>;
  }

  async updateShiftLoad(load_id: string, updates: Partial<InsertShiftLoad>): Promise<ShiftLoad> {
    await db.update(shiftLoadsTable)
      .set(updates)
      .where(eq(shiftLoadsTable.load_id, load_id));
    
    return this.getShiftLoad(load_id) as Promise<ShiftLoad>;
  }

  async deleteShiftLoad(load_id: string): Promise<boolean> {
    await db.delete(shiftLoadsTable)
      .where(eq(shiftLoadsTable.load_id, load_id));
    
    return true;
  }

  async deleteShiftLoadsBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    await db.delete(shiftLoadsTable)
      .where(inArray(shiftLoadsTable.load_id, ids));
    
    return ids.length;
  }

  // Route Templates
  async getRouteTemplates(): Promise<RouteTemplate[]> {
    const templates = await db.select().from(routeTemplatesTable);
    return templates.map(t => ({
      template_id: t.template_id,
      template_name: t.template_name,
      from_location_id: t.from_location_id,
      to_location_id: t.to_location_id,
      distance_miles: t.distance_miles ?? 0,
      drive_time_minutes: t.drive_time_minutes,
      route_description: t.route_description,
      is_active: t.is_active ?? true,
      notes: t.notes ?? undefined,
      created_at: t.created_at
    }));
  }

  async getRouteTemplate(template_id: string): Promise<RouteTemplate | null> {
    const [template] = await db.select().from(routeTemplatesTable)
      .where(eq(routeTemplatesTable.template_id, template_id));
    
    if (!template) return null;
    
    return {
      template_id: template.template_id,
      template_name: template.template_name,
      from_location_id: template.from_location_id,
      to_location_id: template.to_location_id,
      distance_miles: template.distance_miles ?? 0,
      drive_time_minutes: template.drive_time_minutes,
      route_description: template.route_description,
      is_active: template.is_active ?? true,
      notes: template.notes ?? undefined,
      created_at: template.created_at
    };
  }

  async createRouteTemplate(template: InsertRouteTemplate): Promise<RouteTemplate> {
    const templateId = `TEMPLATE_${randomUUID().substring(0, 8).toUpperCase()}`;
    const newTemplate = {
      ...template,
      template_id: templateId,
      created_at: Date.now()
    };
    
    await db.insert(routeTemplatesTable).values(newTemplate);
    return this.getRouteTemplate(templateId) as Promise<RouteTemplate>;
  }

  async updateRouteTemplate(template_id: string, updates: Partial<InsertRouteTemplate>): Promise<RouteTemplate> {
    await db.update(routeTemplatesTable)
      .set(updates)
      .where(eq(routeTemplatesTable.template_id, template_id));
    
    return this.getRouteTemplate(template_id) as Promise<RouteTemplate>;
  }

  async deleteRouteTemplate(template_id: string): Promise<boolean> {
    await db.delete(routeTemplatesTable)
      .where(eq(routeTemplatesTable.template_id, template_id));
    
    return true;
  }

  async deleteRouteTemplatesBulk(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    
    await db.delete(routeTemplatesTable)
      .where(inArray(routeTemplatesTable.template_id, ids));
    
    return ids.length;
  }
}

// Helper function used by both storage classes
function generateLocationId(name: string): string {
  return name
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '') // Remove non-alphanumeric except spaces
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_+/g, '_') // Replace multiple underscores with single
    .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
}

// Export database storage (PostgreSQL for permanent persistence)
export const storage = new DatabaseStorage();
