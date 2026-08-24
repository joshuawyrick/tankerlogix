#!/usr/bin/env tsx
/**
 * Migration script to transfer existing JSON data to PostgreSQL database
 * Run with: npm run migrate-data
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { db } from './db';
import { 
  locationsTable,
  configTable,
  routeOverridesTable,
  customersTable,
  contractedRoutesTable,
  shiftsTable,
  shiftLoadsTable,
  routeTemplatesTable
} from '@shared/schema';
import { sql } from 'drizzle-orm';

// Determine data directory
const dataDir = process.env.NODE_ENV === 'production' 
  ? join(process.cwd(), 'production_data')
  : join(process.cwd(), 'data');

console.log('🔄 Starting data migration from JSON files to PostgreSQL...');
console.log(`📁 Reading from: ${dataDir}`);

async function loadJsonFile<T>(filename: string): Promise<T | null> {
  const filepath = join(dataDir, filename);
  if (!existsSync(filepath)) {
    console.log(`⚠️  File not found: ${filename}`);
    return null;
  }
  
  try {
    const content = readFileSync(filepath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading ${filename}:`, error);
    return null;
  }
}

async function migrateLocations() {
  console.log('\n📍 Migrating locations...');
  const locations = await loadJsonFile<any[]>('locations.json');
  
  if (!locations || locations.length === 0) {
    console.log('  No locations to migrate');
    return;
  }
  
  // Fetch all existing location IDs in one query
  const existingLocations = await db.select({ location_id: locationsTable.location_id })
    .from(locationsTable);
  const existingIds = new Set(existingLocations.map(l => l.location_id));
  
  // Filter out locations that already exist
  const newLocations = locations.filter(loc => !existingIds.has(loc.location_id));
  
  if (newLocations.length === 0) {
    console.log('  All locations already exist in database');
    return;
  }
  
  // Process locations in chunks of 200
  const BATCH_SIZE = 200;
  let totalMigrated = 0;
  
  for (let i = 0; i < newLocations.length; i += BATCH_SIZE) {
    const chunk = newLocations.slice(i, i + BATCH_SIZE);
    const values = chunk.map(location => ({
      location_id: location.location_id,
      name: location.name,
      role: location.role,
      lat: location.lat,
      lon: location.lon,
      allowed_load_types: location.allowed_load_types || 'crude,diesel',
      default_units_loaded: location.default_units_loaded,
      default_pickup_min: location.default_pickup_min,
      default_dropoff_min: location.default_dropoff_min,
      pickup_queue_min: location.pickup_queue_min,
      dropoff_queue_min: location.dropoff_queue_min,
      api_gravity: location.api_gravity,
      avg_speed: location.avg_speed,
      notes: location.notes,
      is_base_yard: location.is_base_yard || false
    }));
    
    try {
      await db.insert(locationsTable)
        .values(values)
        .onConflictDoNothing({ target: locationsTable.location_id });
      
      totalMigrated += chunk.length;
      console.log(`  Progress: ${totalMigrated}/${newLocations.length} locations`);
    } catch (error) {
      console.error(`  ❌ Failed to migrate batch ${i/BATCH_SIZE + 1}:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${totalMigrated} locations`);
}

async function migrateConfig() {
  console.log('\n⚙️  Migrating configuration...');
  const config = await loadJsonFile<any>('config.json');
  
  if (!config) {
    console.log('  No config to migrate');
    return;
  }
  
  try {
    // Check if config exists
    const existing = await db.select().from(configTable).limit(1);
    
    if (existing.length === 0) {
      await db.insert(configTable).values({
        avg_mph_default: config.avg_mph_default || 41,
        hourly_target_default_usd: config.hourly_target_default_usd || 135,
        traffic_buffer_min_default: config.traffic_buffer_min_default || 20,
        pickup_time_min_default: config.pickup_time_min_default || 45,
        dropoff_time_min_default: config.dropoff_time_min_default || 60,
        include_deadhead_default: config.include_deadhead_default !== false,
        assume_symmetric_route_for_empty: config.assume_symmetric_route_for_empty !== false,
        base_yard_name: config.base_yard_name || 'Yard',
        base_lat: config.base_lat || 35.3,
        base_lon: config.base_lon || -119.1,
        diesel_units_are_gallons: config.diesel_units_are_gallons !== false,
        crude_units_are_barrels: config.crude_units_are_barrels !== false,
        barrels_to_gallons_factor: config.barrels_to_gallons_factor || 42
      });
      console.log('  ✅ Config migrated');
    } else {
      console.log('  Config already exists in database');
    }
  } catch (error) {
    console.error('  ❌ Failed to migrate config:', error);
  }
}

async function migrateCustomers() {
  console.log('\n👥 Migrating customers...');
  const customers = await loadJsonFile<any[]>('customers.json');
  
  if (!customers || customers.length === 0) {
    console.log('  No customers to migrate');
    return;
  }
  
  let count = 0;
  for (const customer of customers) {
    try {
      const existing = await db.select().from(customersTable)
        .where(sql`${customersTable.customer_id} = ${customer.customer_id}`)
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(customersTable).values({
          customer_id: customer.customer_id,
          customer_name: customer.customer_name,
          customer_code: customer.customer_code,
          notes: customer.notes,
          created_at: customer.created_at || Date.now()
        });
        count++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to migrate customer ${customer.customer_name}:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${count} customers`);
}

async function migrateContractedRoutes() {
  console.log('\n🚛 Migrating contracted routes...');
  const routes = await loadJsonFile<any[]>('contractedRoutes.json');
  
  if (!routes || routes.length === 0) {
    console.log('  No contracted routes to migrate');
    return;
  }
  
  let count = 0;
  for (const route of routes) {
    try {
      const existing = await db.select().from(contractedRoutesTable)
        .where(sql`${contractedRoutesTable.route_id} = ${route.route_id}`)
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(contractedRoutesTable).values({
          route_id: route.route_id,
          route_name: route.route_name,
          customer_id: route.customer_id,
          pickup_location_id: route.pickup_location_id,
          dropoff_location_id: route.dropoff_location_id,
          product_type: route.product_type || 'crude',
          avg_volume: route.avg_volume || 0,
          rate_per_unit: route.rate_per_unit || 0,
          rate_type: route.rate_type || 'per_barrel',
          avg_pickup_time: route.avg_pickup_time,
          avg_dropoff_time: route.avg_dropoff_time,
          avg_speed: route.avg_speed,
          notes: route.notes
        });
        count++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to migrate route ${route.route_name}:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${count} contracted routes`);
}

async function migrateShifts() {
  console.log('\n📅 Migrating shifts...');
  const shifts = await loadJsonFile<any[]>('shifts.json');
  
  if (!shifts || shifts.length === 0) {
    console.log('  No shifts to migrate');
    return;
  }
  
  let count = 0;
  for (const shift of shifts) {
    try {
      const existing = await db.select().from(shiftsTable)
        .where(sql`${shiftsTable.shift_id} = ${shift.shift_id}`)
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(shiftsTable).values({
          shift_id: shift.shift_id,
          name: shift.name,
          shift_date: shift.shift_date,
          status: shift.status || 'planned',
          start_yard_id: shift.start_yard_id,
          end_yard_id: shift.end_yard_id,
          target_hourly_rate_usd: shift.target_hourly_rate_usd,
          travel_speed_mph: shift.travel_speed_mph,
          traffic_buffer_min: shift.traffic_buffer_min,
          total_revenue: shift.total_revenue,
          total_drive_time_hours: shift.total_drive_time_hours,
          total_work_time_hours: shift.total_work_time_hours,
          total_miles: shift.total_miles,
          effective_hourly_rate: shift.effective_hourly_rate,
          deadhead_start_miles: shift.deadhead_start_miles,
          deadhead_return_miles: shift.deadhead_return_miles,
          segment_details: shift.segment_details,
          notes: shift.notes,
          created_at: shift.created_at || Date.now()
        });
        count++;
        
        // Migrate shift loads if they exist
        if (shift.loads && shift.loads.length > 0) {
          for (const load of shift.loads) {
            try {
              await db.insert(shiftLoadsTable).values({
                load_id: load.load_id,
                shift_id: shift.shift_id,
                load_order: load.load_order,
                customer_id: load.customer_id,
                pickup_location_id: load.pickup_location_id,
                dropoff_location_id: load.dropoff_location_id,
                pickup_location_name: load.pickup_location_name,
                dropoff_location_name: load.dropoff_location_name,
                contracted_route_id: load.contracted_route_id,
                route_template_id: load.route_template_id,
                product_type: load.product_type || 'crude',
                volume: load.volume || 0,
                rate_per_unit: load.rate_per_unit || 0,
                rate_type: load.rate_type || 'per_barrel',
                pickup_time_min: load.pickup_time_min || 0,
                dropoff_time_min: load.dropoff_time_min || 0,
                avg_speed: load.avg_speed || 41,
                deadhead_miles: load.deadhead_miles,
                loaded_miles: load.loaded_miles,
                total_miles: load.total_miles,
                drive_time_hours: load.drive_time_hours,
                total_time_hours: load.total_time_hours,
                revenue: load.revenue || load.load_revenue,
                effective_rate_per_hour: load.effective_rate_per_hour,
                route_segments: load.route_segments,
                calculation_results: load.calculation_results,
                notes: load.notes
              });
            } catch (error) {
              console.error(`    ❌ Failed to migrate load ${load.load_id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error(`  ❌ Failed to migrate shift ${shift.name}:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${count} shifts`);
}

async function migrateRouteTemplates() {
  console.log('\n📋 Migrating route templates...');
  const templates = await loadJsonFile<any[]>('routeTemplates.json');
  
  if (!templates || templates.length === 0) {
    console.log('  No route templates to migrate');
    return;
  }
  
  let count = 0;
  for (const template of templates) {
    try {
      const existing = await db.select().from(routeTemplatesTable)
        .where(sql`${routeTemplatesTable.template_id} = ${template.template_id}`)
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(routeTemplatesTable).values({
          template_id: template.template_id,
          template_name: template.template_name,
          from_location_id: template.from_location_id,
          to_location_id: template.to_location_id,
          distance_miles: template.distance_miles || 0,
          drive_time_minutes: template.drive_time_minutes || 0,
          route_description: template.route_description || '',
          is_active: template.is_active !== false,
          notes: template.notes,
          created_at: template.created_at || Date.now()
        });
        count++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to migrate template ${template.template_name}:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${count} route templates`);
}

async function migrateRouteOverrides() {
  console.log('\n🔄 Migrating route overrides...');
  const overrides = await loadJsonFile<any[]>('overrides.json');
  
  if (!overrides || overrides.length === 0) {
    console.log('  No route overrides to migrate');
    return;
  }
  
  let count = 0;
  for (const override of overrides) {
    try {
      const existing = await db.select().from(routeOverridesTable)
        .where(sql`${routeOverridesTable.pickup_location_id} = ${override.pickup_location_id} 
          AND ${routeOverridesTable.dropoff_location_id} = ${override.dropoff_location_id}`)
        .limit(1);
      
      if (existing.length === 0) {
        await db.insert(routeOverridesTable).values({
          pickup_location_id: override.pickup_location_id,
          dropoff_location_id: override.dropoff_location_id,
          mph_override: override.mph_override,
          default_units_loaded_override: override.default_units_loaded_override,
          notes: override.notes
        });
        count++;
      }
    } catch (error) {
      console.error(`  ❌ Failed to migrate override:`, error);
    }
  }
  
  console.log(`  ✅ Migrated ${count} route overrides`);
}

async function main() {
  try {
    await migrateLocations();
    await migrateConfig();
    await migrateCustomers();
    await migrateContractedRoutes();
    await migrateShifts();
    await migrateRouteTemplates();
    await migrateRouteOverrides();
    
    console.log('\n✅ Migration completed successfully!');
    console.log('📝 Note: The application will now use PostgreSQL for data storage.');
    console.log('🔒 Your data is now permanently stored and will persist across deployments.');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main();