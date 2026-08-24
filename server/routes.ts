import type { Express, Request } from "express";
import { z } from "zod";
import { createServer, type Server } from "http";
import multer from "multer";
import XLSX from "xlsx";
import ExcelJS from "exceljs";
import { storage } from "./storage";
import { 
  locationSchema, 
  insertLocationSchema, 
  configSchema, 
  routeOverrideSchema, 
  calculationRequestSchema,
  routeRequestSchema,
  customerSchema,
  insertCustomerSchema,
  contractedRouteSchema,
  insertContractedRouteSchema,
  shiftSchema,
  insertShiftSchema,
  shiftLoadSchema,
  insertShiftLoadSchema,
  shiftCalculationRequestSchema,
  routeTemplateSchema,
  insertRouteTemplateSchema,
  type Location,
  type Customer,
  type ContractedRoute,
  type RouteTemplate,
  type Shift,
  type ShiftLoad
} from "@shared/schema";
import { isWithinOperatingRegion, OPERATING_REGION, getLocationIssues } from "@shared/location-validation";

// Configure multer for file uploads
const upload = multer({ 
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// Google Maps API configuration
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY || "";

if (!GOOGLE_MAPS_API_KEY) {
  console.warn("Warning: GOOGLE_MAPS_API_KEY not found in environment variables");
}

// Route calculation utilities
function generateRouteKey(origin: {lat: number, lon: number}, destination: {lat: number, lon: number}, waypoints?: {lat: number, lon: number}[]): string {
  const waypointsSig = waypoints ? waypoints.map(w => `${w.lat},${w.lon}`).join('|') : '';
  return `${origin.lat},${origin.lon}|${destination.lat},${destination.lon}|${waypointsSig}`;
}

async function getGoogleMapsRoutes(request: any) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key not configured");
  }

  const { origin, destination, alternatives = true, avoid = {} } = request;
  
  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lon}`,
    destination: `${destination.lat},${destination.lon}`,
    key: GOOGLE_MAPS_API_KEY,
    alternatives: alternatives.toString(),
  });

  if (avoid.tolls) params.append('avoid', 'tolls');
  if (avoid.ferries) params.append('avoid', 'ferries');

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
  
  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.status !== 'OK') {
    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  return data.routes.map((route: any, index: number) => {
    const totalMeters = route.legs.reduce((total: number, leg: any) => total + leg.distance.value, 0);
    const totalSeconds = route.legs.reduce((total: number, leg: any) => total + leg.duration.value, 0);
    const totalMiles = totalMeters / 1609.34;
    const totalHours = totalSeconds / 3600;
    
    return {
      id: `route_${index}`,
      route_id: `route_${index}`, // Include both for compatibility
      summary: route.summary || `Route ${index + 1}`,
      miles: totalMiles,
      distance_miles: totalMiles,
      duration_hours: totalHours,
      distance_text: `${totalMiles.toFixed(1)} mi`,
      duration_text: `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m`,
      polyline: route.overview_polyline.points,
    };
  });
}

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number; formatted_address: string }> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key not configured");
  }

  const params = new URLSearchParams({
    address,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?${params}`);

  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.statusText}`);
  }

  const data = await response.json();

  if (data.status === 'ZERO_RESULTS' || !data.results || data.results.length === 0) {
    throw new Error("No matching location found for that address");
  }

  if (data.status !== 'OK') {
    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  const result = data.results[0];
  return {
    lat: result.geometry.location.lat,
    lon: result.geometry.location.lng,
    formatted_address: result.formatted_address,
  };
}

async function getGoogleMapsDrivingDistance(origin: {lat: number, lon: number}, destination: {lat: number, lon: number}) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("Google Maps API key not configured");
  }

  const params = new URLSearchParams({
    origin: `${origin.lat},${origin.lon}`,
    destination: `${destination.lat},${destination.lon}`,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
  
  if (!response.ok) {
    throw new Error(`Google Maps API error: ${response.statusText}`);
  }

  const data = await response.json();
  
  if (data.status !== 'OK') {
    throw new Error(`Google Maps API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
  }

  // Get the first route's total distance in miles
  const route = data.routes[0];
  const distanceInMiles = route.legs.reduce((total: number, leg: any) => total + leg.distance.value, 0) / 1609.34;
  
  return distanceInMiles;
}

async function calculateRates(request: any, routes: any[], locations: any[], config: any, storage: any) {
  const pickup = locations.find(l => l.location_id === request.pickup_location_id);
  const dropoff = locations.find(l => l.location_id === request.dropoff_location_id);
  
  if (!pickup || !dropoff) {
    throw new Error("Invalid pickup or dropoff location");
  }

  return Promise.all(routes.map(async (route) => {
    let totalMiles = route.miles;
    let emptyMiles = 0;
    let baseToPickupMiles = 0;
    let dropoffToBaseMiles = 0;

    // Add deadhead miles based on type
    if (request.include_deadhead && request.deadhead_type) {
      // Use the selected base yard if provided, otherwise use config base yard
      let baseLocation = { lat: config.base_lat, lon: config.base_lon };
      
      if (request.base_yard_id) {
        const baseYard = locations.find(l => l.location_id === request.base_yard_id && l.is_base_yard);
        if (baseYard) {
          baseLocation = { lat: baseYard.lat, lon: baseYard.lon };
        }
      }
      
      const pickupLocation = { lat: pickup.lat, lon: pickup.lon };
      const dropoffLocation = { lat: dropoff.lat, lon: dropoff.lon };
      
      if (request.deadhead_type === 'oneway') {
        // One-way: only yard to pickup using Google Maps
        baseToPickupMiles = await getGoogleMapsDrivingDistance(baseLocation, pickupLocation);
        emptyMiles = baseToPickupMiles;
        totalMiles += emptyMiles;
      } else if (request.deadhead_type === 'portaltoportal') {
        // Portal to Portal: yard to pickup + dropoff to yard using Google Maps
        baseToPickupMiles = await getGoogleMapsDrivingDistance(baseLocation, pickupLocation);
        dropoffToBaseMiles = await getGoogleMapsDrivingDistance(dropoffLocation, baseLocation);
        emptyMiles = baseToPickupMiles + dropoffToBaseMiles;
        totalMiles += emptyMiles;
      } else if (request.deadhead_type === 'roundtrip') {
        // Round trip: pickup to dropoff distance x 2
        emptyMiles = route.miles; // Return trip distance
        totalMiles = route.miles * 2; // Explicitly set to pickup-to-dropoff distance x 2
      }
    } else if (request.include_deadhead) {
      // Legacy support: if deadhead_type not specified but include_deadhead is true, use portaltoportal
      let baseLocation = { lat: config.base_lat, lon: config.base_lon };
      
      if (request.base_yard_id) {
        const baseYard = locations.find(l => l.location_id === request.base_yard_id && l.is_base_yard);
        if (baseYard) {
          baseLocation = { lat: baseYard.lat, lon: baseYard.lon };
        }
      }
      
      const pickupLocation = { lat: pickup.lat, lon: pickup.lon };
      const dropoffLocation = { lat: dropoff.lat, lon: dropoff.lon };
      
      baseToPickupMiles = await getGoogleMapsDrivingDistance(baseLocation, pickupLocation);
      dropoffToBaseMiles = await getGoogleMapsDrivingDistance(dropoffLocation, baseLocation);
      emptyMiles = baseToPickupMiles + dropoffToBaseMiles;
      totalMiles += emptyMiles;
    }

    // Calculate times
    const driveTimeHr = totalMiles / request.avg_mph;
    const workTimeHr = (
      request.pickup_time_min + 
      request.dropoff_time_min + 
      (pickup.pickup_queue_min || 0) + 
      (dropoff.dropoff_queue_min || 0) + 
      request.traffic_buffer_min
    ) / 60;
    
    const totalHours = driveTimeHr + workTimeHr;
    const requiredRevenue = totalHours * request.hourly_target_usd;

    // Calculate rates
    const ratePerUnit = requiredRevenue / request.units_loaded;
    const ratePerMileTotal = requiredRevenue / totalMiles;
    const ratePerMileLoaded = requiredRevenue / route.miles;

    return {
      ...route,
      distance_miles: route.miles,
      total_miles: totalMiles,
      empty_miles: emptyMiles,
      base_to_pickup_miles: baseToPickupMiles,
      dropoff_to_base_miles: dropoffToBaseMiles,
      drive_time_hr: driveTimeHr,
      work_time_hr: workTimeHr,
      total_time_hr: totalHours,
      required_revenue: requiredRevenue,
      rate_per_unit: ratePerUnit,
      rate_per_mile_total: ratePerMileTotal,
      rate_per_mile_loaded: ratePerMileLoaded,
    };
  }));
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
  });

  // Google Maps API key endpoint for frontend
  app.get('/api/google-maps-key', (req, res) => {
    if (GOOGLE_MAPS_API_KEY) {
      res.json({ key: GOOGLE_MAPS_API_KEY });
    } else {
      res.status(404).json({ error: 'Google Maps API key not configured' });
    }
  });

  // Export locations to CSV
  app.get('/api/locations/export', async (req, res) => {
    try {
      const locations = await storage.getLocations();
      
      // Helper function to escape CSV values
      const escapeCSV = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        const strValue = String(value);
        // If value contains comma, newline, or quote, wrap in quotes and escape internal quotes
        if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
          return '"' + strValue.replace(/"/g, '""') + '"';
        }
        return strValue;
      };
      
      // Build CSV content with exact template headers
      const csvRows = [];
      
      // Header row matching the upload template exactly
      csvRows.push('name,role,lat,long,product_types,default_volume,pickup_time,dropoff_time,avg_speed,notes');
      
      // Add location data rows
      for (const location of locations) {
        const row = [
          escapeCSV(location.name),
          escapeCSV(location.role),
          escapeCSV(location.lat ?? ''),  // Handle null/undefined coordinates
          escapeCSV(location.lon ?? ''),  // Map 'lon' to 'long' for export
          escapeCSV(location.allowed_load_types ?? 'crude,diesel'),  // Map to 'product_types'
          escapeCSV(location.default_units_loaded ?? ''),  // Map to 'default_volume'
          escapeCSV(location.default_pickup_min ?? ''),  // Map to 'pickup_time'
          escapeCSV(location.default_dropoff_min ?? ''),  // Map to 'dropoff_time'
          escapeCSV(location.avg_speed ?? ''),
          escapeCSV(location.notes ?? '')
        ].join(',');
        csvRows.push(row);
      }
      
      const csvContent = csvRows.join('\n');
      
      // Set response headers for file download
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="locations_export.csv"');
      res.send(csvContent);
    } catch (error: any) {
      console.error('Export error:', error);
      res.status(500).json({ error: 'Failed to export locations' });
    }
  });


  // Locations endpoints
  app.get('/api/locations', async (req, res) => {
    try {
      const locations = await storage.getLocations();
      res.json(locations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get locations' });
    }
  });

  app.post('/api/locations', async (req, res) => {
    try {
      const locationData = insertLocationSchema.parse(req.body);
      
      // Enforce invariant: if is_base_yard is true, role must be 'yard'
      if (locationData.is_base_yard) {
        if (locationData.role && locationData.role !== 'yard') {
          return res.status(400).json({ 
            error: 'Base yards must have role "yard"' 
          });
        }
        locationData.role = 'yard';
      }
      
      const location = await storage.createLocation(locationData);
      // Run data-quality rules on the saved record so direct API callers get the
      // same warn-but-allow feedback the UI/import paths surface. Single source
      // of truth: getLocationIssues() from shared/location-validation.
      const warnings = getLocationIssues(location);
      res.json({ ...location, warnings });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/locations/:id', async (req, res) => {
    try {
      const updates = locationSchema.partial().parse(req.body);
      
      // Enforce invariant: if is_base_yard is true, role must be 'yard'
      if (updates.is_base_yard) {
        if (updates.role && updates.role !== 'yard') {
          return res.status(400).json({ 
            error: 'Base yards must have role "yard"' 
          });
        }
        updates.role = 'yard';
      }
      
      const location = await storage.updateLocation(req.params.id, updates);
      if (!location) {
        return res.status(404).json({ error: 'Location not found' });
      }
      // Run data-quality rules on the saved record so direct API callers get the
      // same warn-but-allow feedback the UI/import paths surface.
      const warnings = getLocationIssues(location);
      res.json({ ...location, warnings });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Geocode an address into coordinates (used by the quick-fix flow on the
  // Needs Attention list). Keeps the Google Maps API key server-side.
  app.post('/api/geocode', async (req, res) => {
    try {
      const { address } = req.body ?? {};
      if (typeof address !== 'string' || address.trim().length === 0) {
        return res.status(400).json({ error: 'Address is required' });
      }
      const result = await geocodeAddress(address.trim());
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Batch geocode multiple addresses in one request (used by the "Fix all
  // flagged" bulk action). Returns a per-item result so a single bad address
  // doesn't fail the whole batch. Keeps the Google Maps API key server-side.
  app.post('/api/geocode/batch', async (req, res) => {
    try {
      const { items } = req.body ?? {};
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'items must be a non-empty array' });
      }
      if (items.length > 100) {
        return res.status(400).json({ error: 'Too many items (max 100 per batch)' });
      }

      const results = await Promise.all(
        items.map(async (item: any) => {
          const id = typeof item?.id === 'string' ? item.id : null;
          const address = typeof item?.address === 'string' ? item.address.trim() : '';
          if (!id) {
            return { id: null, success: false, error: 'Missing id' };
          }
          if (address.length === 0) {
            return { id, success: false, error: 'Address is required' };
          }
          try {
            const result = await geocodeAddress(address);
            return { id, success: true, ...result };
          } catch (error: any) {
            return { id, success: false, error: error.message };
          }
        }),
      );

      res.json({ results });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk delete endpoints (must be before :id route)
  app.delete('/api/locations/bulk', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }
      const result = await storage.deleteLocationsBulk(ids);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/locations/by-role/:role', async (req, res) => {
    try {
      const role = req.params.role as 'pickup' | 'dropoff' | 'both' | 'yard';
      if (!['pickup', 'dropoff', 'both', 'yard'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role. Must be pickup, dropoff, both, or yard' });
      }
      const result = await storage.deleteLocationsByRole(role);
      res.json(result);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/locations/:id', async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Customer endpoints
  app.get('/api/customers', async (req, res) => {
    try {
      const customers = await storage.getCustomers();
      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get customers' });
    }
  });

  app.get('/api/customers/:customer_id', async (req, res) => {
    try {
      const customer = await storage.getCustomer(req.params.customer_id);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      res.json(customer);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/customers', async (req, res) => {
    try {
      const customerData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(customerData);
      res.json(customer);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch('/api/customers/:customer_id', async (req, res) => {
    try {
      const updates = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(req.params.customer_id, updates);
      res.json(customer);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/customers/bulk', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }
      const deletedCount = await storage.deleteCustomersBulk(ids);
      res.json({ deleted: deletedCount });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/customers/:customer_id', async (req, res) => {
    try {
      const success = await storage.deleteCustomer(req.params.customer_id);
      if (!success) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Contracted Routes endpoints
  app.get('/api/contracted-routes', async (req, res) => {
    try {
      const routes = await storage.getContractedRoutes();
      res.json(routes);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get contracted routes' });
    }
  });

  // Export contracted routes to CSV - must be before :id route
  app.get('/api/contracted-routes/export', async (req, res) => {
    try {
      const routes = await storage.getContractedRoutes();
      const locations = await storage.getLocations();
      const customers = await storage.getCustomers();
      
      // Helper function to escape CSV values
      const escapeCSV = (value: any): string => {
        if (value === null || value === undefined) {
          return '';
        }
        const strValue = String(value);
        if (strValue.includes(',') || strValue.includes('\n') || strValue.includes('"')) {
          return '"' + strValue.replace(/"/g, '""') + '"';
        }
        return strValue;
      };
      
      // Build CSV content
      const csvRows = [];
      
      // Header row
      csvRows.push([
        'route_name',
        'customer_name',
        'pickup_location',
        'dropoff_location',
        'product_type',
        'avg_volume',
        'rate_per_unit',
        'rate_type',
        'avg_pickup_time',
        'avg_dropoff_time',
        'avg_speed',
        'notes'
      ].join(','));
      
      // Data rows
      for (const route of routes) {
        const pickupLocation = locations.find(l => l.location_id === route.pickup_location_id);
        const dropoffLocation = locations.find(l => l.location_id === route.dropoff_location_id);
        const customer = route.customer_id ? customers.find(c => c.customer_id === route.customer_id) : null;
        
        csvRows.push([
          escapeCSV(route.route_name),
          escapeCSV(customer?.customer_name || ''),
          escapeCSV(pickupLocation?.name || route.pickup_location_id),
          escapeCSV(dropoffLocation?.name || route.dropoff_location_id),
          escapeCSV(route.product_type),
          escapeCSV(route.avg_volume),
          escapeCSV(route.rate_per_unit),
          escapeCSV(route.rate_type),
          escapeCSV(route.avg_pickup_time || ''),
          escapeCSV(route.avg_dropoff_time || ''),
          escapeCSV(route.avg_speed || ''),
          escapeCSV(route.notes || '')
        ].join(','));
      }
      
      // Send CSV file
      const csv = csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contracted_routes.csv"');
      res.send(csv);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to export contracted routes' });
    }
  });

  // Download template for contracted routes import
  app.get('/api/contracted-routes-template', async (req, res) => {
    try {
      // Generate template CSV content
      const templateContent = [
        'route_name,customer_name,pickup_location,dropoff_location,product_type,avg_volume,rate_per_unit,rate_type,avg_pickup_time,avg_dropoff_time,avg_speed,notes',
        'Sample Route 1,,Location A,Location B,crude,100,2.50,per_barrel,45,60,55,This is a sample route',
        'Sample Route 2,Customer ABC,Location C,Location D,diesel,250,0.75,per_gallon,30,45,60,High priority route',
        'Sample Route 3,Customer XYZ,Location E,Location F,both,500,150,flat_rate,60,90,50,Fixed rate contract',
        '',
        '// Instructions:',
        '// - route_name: Required - Name of the route',
        '// - customer_name: Optional - Name of the customer (must exist in Customers)',
        '// - pickup_location: Required - Name of pickup location (must exist in Locations)',
        '// - dropoff_location: Required - Name of dropoff location (must exist in Locations)',
        '// - product_type: Optional - crude, diesel, or both (defaults to both)',
        '// - avg_volume: Optional - Average volume (defaults to 0)',
        '// - rate_per_unit: Optional - Rate per unit (defaults to 0)',
        '// - rate_type: Optional - per_barrel, per_gallon, or flat_rate (defaults to per_barrel)',
        '// - avg_pickup_time: Optional - Average pickup time in minutes',
        '// - avg_dropoff_time: Optional - Average dropoff time in minutes',
        '// - avg_speed: Optional - Average speed in mph',
        '// - notes: Optional - Any additional notes',
        '// Remove these instruction lines before uploading'
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="contracted_routes_template.csv"');
      res.send(templateContent);
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to generate template' });
    }
  });

  app.get('/api/contracted-routes/:id', async (req, res) => {
    try {
      const route = await storage.getContractedRoute(req.params.id);
      if (!route) {
        return res.status(404).json({ error: 'Route not found' });
      }
      res.json(route);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/contracted-routes', async (req, res) => {
    try {
      const routeData = insertContractedRouteSchema.parse(req.body);
      const route = await storage.createContractedRoute(routeData);
      res.json(route);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.patch('/api/contracted-routes/:id', async (req, res) => {
    try {
      const updates = insertContractedRouteSchema.partial().parse(req.body);
      const route = await storage.updateContractedRoute(req.params.id, updates);
      res.json(route);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Bulk delete contracted routes
  app.delete('/api/contracted-routes/bulk', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }
      const deletedCount = await storage.deleteContractedRoutesBulk(ids);
      res.json({ deleted: deletedCount });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/contracted-routes/:id', async (req, res) => {
    try {
      const success = await storage.deleteContractedRoute(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Route not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Shifts endpoints
  app.get('/api/shifts', async (req, res) => {
    try {
      const shifts = await storage.getShifts();
      res.json(shifts);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get shifts' });
    }
  });

  app.get('/api/shifts/:id', async (req, res) => {
    try {
      const shift = await storage.getShift(req.params.id);
      if (!shift) {
        return res.status(404).json({ error: 'Shift not found' });
      }
      res.json(shift);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/shifts', async (req, res) => {
    try {
      const shiftData = insertShiftSchema.parse(req.body);
      const shift = await storage.createShift(shiftData);
      res.status(201).json(shift);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/shifts/:id', async (req, res) => {
    try {
      // Use the full shift schema for updates to allow calculated fields
      const shiftData = shiftSchema.partial().omit({ shift_id: true, created_at: true }).parse(req.body);
      const shift = await storage.updateShift(req.params.id, shiftData);
      res.json(shift);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/shifts/bulk', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }
      const deletedCount = await storage.deleteShiftsBulk(ids);
      res.json({ deleted: deletedCount });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/shifts/:id', async (req, res) => {
    try {
      const success = await storage.deleteShift(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Shift not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Shift Loads endpoints
  app.get('/api/shifts/:shiftId/loads', async (req, res) => {
    try {
      const loads = await storage.getShiftLoads(req.params.shiftId);
      res.json(loads);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get shift loads' });
    }
  });

  app.post('/api/shifts/:shiftId/loads', async (req, res) => {
    try {
      const loadData = {
        ...req.body,
        shift_id: req.params.shiftId
      };
      
      // Verify shift exists
      const shift = await storage.getShift(req.params.shiftId);
      if (!shift) {
        return res.status(400).json({ error: `Shift ${req.params.shiftId} not found` });
      }

      const load = await storage.createShiftLoad(loadData);
      res.status(200).json(load);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.get('/api/shift-loads/:id', async (req, res) => {
    try {
      const load = await storage.getShiftLoad(req.params.id);
      if (!load) {
        return res.status(404).json({ error: 'Shift load not found' });
      }
      res.json(load);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/shift-loads', async (req, res) => {
    try {
      const loadData = insertShiftLoadSchema.parse(req.body);
      
      // Verify shift exists
      const shift = await storage.getShift(loadData.shift_id);
      if (!shift) {
        return res.status(400).json({ error: `Shift ${loadData.shift_id} not found` });
      }

      // Verify contracted route exists if provided
      if (loadData.contracted_route_id) {
        const contractedRoute = await storage.getContractedRoute(loadData.contracted_route_id);
        if (!contractedRoute) {
          return res.status(400).json({ error: `Contracted route ${loadData.contracted_route_id} not found` });
        }
      }

      const load = await storage.createShiftLoad(loadData);
      res.status(201).json(load);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.put('/api/shift-loads/:id', async (req, res) => {
    try {
      const loadData = insertShiftLoadSchema.partial().parse(req.body);
      
      // Verify shift exists if being updated
      if (loadData.shift_id) {
        const shift = await storage.getShift(loadData.shift_id);
        if (!shift) {
          return res.status(400).json({ error: `Shift ${loadData.shift_id} not found` });
        }
      }

      // Verify contracted route exists if being updated
      if (loadData.contracted_route_id) {
        const contractedRoute = await storage.getContractedRoute(loadData.contracted_route_id);
        if (!contractedRoute) {
          return res.status(400).json({ error: `Contracted route ${loadData.contracted_route_id} not found` });
        }
      }

      const load = await storage.updateShiftLoad(req.params.id, loadData);
      res.json(load);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/shift-loads/bulk', async (req, res) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) {
        return res.status(400).json({ error: 'IDs must be an array' });
      }
      const deletedCount = await storage.deleteShiftLoadsBulk(ids);
      res.json({ deleted: deletedCount });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.delete('/api/shift-loads/:id', async (req, res) => {
    try {
      const success = await storage.deleteShiftLoad(req.params.id);
      if (!success) {
        return res.status(404).json({ error: 'Shift load not found' });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Shift calculation endpoint
  app.post('/api/shifts/calculate', async (req, res) => {
    try {
      const calculationRequest = shiftCalculationRequestSchema.parse(req.body);
      
      // Get required data
      const locations = await storage.getLocations();
      const config = await storage.getConfig();
      
      // Use user-configured speed or fall back to config default
      const userSpeed = calculationRequest.avg_mph || config.avg_mph_default;
      
      // Sort loads by load_order
      const sortedLoads = [...calculationRequest.loads].sort((a, b) => a.load_order - b.load_order);
      
      let totalRevenue = 0;
      let totalDriveTimeHours = 0;
      let totalWorkTimeHours = 0;
      let totalMiles = 0;
      const loadCalculations = [];
      
      for (let i = 0; i < sortedLoads.length; i++) {
        const load = sortedLoads[i];
        
        // Find pickup and dropoff locations
        const pickupLocation = locations.find(l => l.location_id === load.pickup_location_id);
        const dropoffLocation = locations.find(l => l.location_id === load.dropoff_location_id);
        
        if (!pickupLocation || !dropoffLocation) {
          return res.status(400).json({ 
            error: `Invalid pickup or dropoff location for load ${load.load_order}` 
          });
        }
        
        // Check for missing coordinates
        if (!pickupLocation.lat || !pickupLocation.lon || !dropoffLocation.lat || !dropoffLocation.lon) {
          return res.status(400).json({ 
            error: `Missing coordinates for locations in load ${load.load_order}` 
          });
        }
        
        // Calculate driving distance for this load (with caching)
        const loadRouteKey = generateRouteKey(
          { lat: pickupLocation.lat, lon: pickupLocation.lon },
          { lat: dropoffLocation.lat, lon: dropoffLocation.lon }
        );
        
        let loadDistance = 0;
        const loadCached = await storage.getRouteCache(loadRouteKey);
        const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
        
        if (loadCached && (Date.now() - loadCached.created_at) < CACHE_TTL && loadCached.routes.length > 0) {
          loadDistance = loadCached.routes[0].miles;
        } else {
          loadDistance = await getGoogleMapsDrivingDistance(
            { lat: pickupLocation.lat, lon: pickupLocation.lon },
            { lat: dropoffLocation.lat, lon: dropoffLocation.lon }
          );
          
          // Cache the result
          await storage.setRouteCache(loadRouteKey, {
            created_at: Date.now(),
            routes: [{
              id: 'route_0',
              summary: `${pickupLocation.name} to ${dropoffLocation.name}`,
              miles: loadDistance,
              polyline: ''
            }]
          });
        }
        
        // Calculate load times using user-configured speed
        const loadDriveTime = loadDistance / userSpeed;
        const loadWorkTime = loadDriveTime + (load.pickup_time_min + load.dropoff_time_min) / 60;
        
        // Calculate load revenue
        let loadRevenue = 0;
        if (load.rate_type === 'flat_rate') {
          loadRevenue = load.rate_per_unit;
        } else {
          loadRevenue = load.volume * load.rate_per_unit;
        }
        
        
        // Add to totals
        totalRevenue += loadRevenue;
        totalDriveTimeHours += loadDriveTime;
        totalWorkTimeHours += loadWorkTime;
        totalMiles += loadDistance;
        
        loadCalculations.push({
          load_order: load.load_order,
          pickup_location: pickupLocation.name,
          dropoff_location: dropoffLocation.name,
          product_type: load.product_type,
          volume: load.volume,
          rate_per_unit: load.rate_per_unit,
          distance_miles: loadDistance,
          drive_time_hours: loadDriveTime,
          work_time_hours: loadWorkTime,
          revenue: loadRevenue
        });
      }
      
      // Calculate transitions between loads (always needed)
      let transitionMiles = 0;
      let transitionHours = 0;
      
      for (let i = 0; i < sortedLoads.length - 1; i++) {
        const currentDropoff = locations.find(l => l.location_id === sortedLoads[i].dropoff_location_id);
        const nextPickup = locations.find(l => l.location_id === sortedLoads[i + 1].pickup_location_id);
        
        if (currentDropoff && nextPickup && currentDropoff.lat && currentDropoff.lon && nextPickup.lat && nextPickup.lon) {
          // Check cache first
          const routeKey = generateRouteKey(
            { lat: currentDropoff.lat, lon: currentDropoff.lon },
            { lat: nextPickup.lat, lon: nextPickup.lon }
          );
          
          let transitionDistance = 0;
          const cached = await storage.getRouteCache(routeKey);
          const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
          
          if (cached && (Date.now() - cached.created_at) < CACHE_TTL && cached.routes.length > 0) {
            transitionDistance = cached.routes[0].miles;
          } else {
            transitionDistance = await getGoogleMapsDrivingDistance(
              { lat: currentDropoff.lat, lon: currentDropoff.lon },
              { lat: nextPickup.lat, lon: nextPickup.lon }
            );
            
            // Cache the result
            await storage.setRouteCache(routeKey, {
              created_at: Date.now(),
              routes: [{
                id: 'route_0',
                summary: `${currentDropoff.name} to ${nextPickup.name}`,
                miles: transitionDistance,
                polyline: ''
              }]
            });
          }
          
          const transitionTime = transitionDistance / userSpeed;
          transitionMiles += transitionDistance;
          transitionHours += transitionTime;
          
          totalMiles += transitionDistance;
          totalDriveTimeHours += transitionTime;
          totalWorkTimeHours += transitionTime;
        }
      }

      // Calculate deadhead if enabled
      let deadheadMiles = 0;
      let deadheadHours = 0;
      let deadheadStartMiles = 0;
      let deadheadStartHours = 0;
      let deadheadReturnMiles = 0;
      let deadheadReturnHours = 0;
      const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      if (calculationRequest.include_deadhead && sortedLoads.length > 0) {
        // Default base yard coordinates
        let baseLocation = { lat: config.base_lat, lon: config.base_lon };
        
        // Use specific base yard if provided
        if (calculationRequest.base_yard_id) {
          const baseYard = locations.find(l => 
            l.location_id === calculationRequest.base_yard_id
          );
          if (baseYard && baseYard.lat && baseYard.lon) {
            baseLocation = { lat: baseYard.lat, lon: baseYard.lon };
          }
        }
        
        const firstPickup = locations.find(l => l.location_id === sortedLoads[0].pickup_location_id);
        const lastDropoff = locations.find(l => l.location_id === sortedLoads[sortedLoads.length - 1].dropoff_location_id);
        
        if (firstPickup && lastDropoff) {
          // Deadhead from base to first pickup (with caching)
          const startRouteKey = generateRouteKey(baseLocation, { lat: firstPickup.lat!, lon: firstPickup.lon! });
          let startDeadhead = 0;
          
          const startCached = await storage.getRouteCache(startRouteKey);
          if (startCached && (Date.now() - startCached.created_at) < CACHE_TTL && startCached.routes.length > 0) {
            startDeadhead = startCached.routes[0].miles;
          } else {
            startDeadhead = await getGoogleMapsDrivingDistance(
              baseLocation,
              { lat: firstPickup.lat!, lon: firstPickup.lon! }
            );
            await storage.setRouteCache(startRouteKey, {
              created_at: Date.now(),
              routes: [{ id: 'route_0', summary: 'Yard to first pickup', miles: startDeadhead, polyline: '' }]
            });
          }
          
          // Deadhead from last dropoff back to base
          let endDeadhead = 0;
          if (calculationRequest.deadhead_type === 'portaltoportal' || calculationRequest.deadhead_type === 'roundtrip') {
            const endRouteKey = generateRouteKey({ lat: lastDropoff.lat!, lon: lastDropoff.lon! }, baseLocation);
            
            const endCached = await storage.getRouteCache(endRouteKey);
            if (endCached && (Date.now() - endCached.created_at) < CACHE_TTL && endCached.routes.length > 0) {
              endDeadhead = endCached.routes[0].miles;
            } else {
              endDeadhead = await getGoogleMapsDrivingDistance(
                { lat: lastDropoff.lat!, lon: lastDropoff.lon! },
                baseLocation
              );
              await storage.setRouteCache(endRouteKey, {
                created_at: Date.now(),
                routes: [{ id: 'route_0', summary: 'Last dropoff to yard', miles: endDeadhead, polyline: '' }]
              });
            }
          }
          
          // Track individual segments
          deadheadStartMiles = startDeadhead;
          deadheadStartHours = deadheadStartMiles / userSpeed;
          deadheadReturnMiles = endDeadhead;
          deadheadReturnHours = deadheadReturnMiles / userSpeed;
          
          // Total deadhead
          deadheadMiles = deadheadStartMiles + deadheadReturnMiles;
          deadheadHours = deadheadStartHours + deadheadReturnHours;
          
          totalMiles += deadheadMiles;
          totalDriveTimeHours += deadheadHours;
          totalWorkTimeHours += deadheadHours;
        }
      }
      
      // Calculate total load/offload time
      let totalLoadOffloadHours = 0;
      for (const load of sortedLoads) {
        totalLoadOffloadHours += (load.pickup_time_min + load.dropoff_time_min) / 60;
      }
      
      // Add traffic buffer to total work time
      const trafficBufferHours = (calculationRequest.traffic_buffer_min || 0) / 60;
      const totalWorkTimeWithBuffer = totalWorkTimeHours + trafficBufferHours;
      
      // Calculate effective hourly rate
      const effectiveHourlyRate = totalWorkTimeWithBuffer > 0 ? totalRevenue / totalWorkTimeWithBuffer : 0;
      
      // Calculate target rate analysis if target hourly rate provided
      let targetAnalysis = {};
      if (calculationRequest.target_hourly_rate) {
        const targetHourlyRate = calculationRequest.target_hourly_rate;
        const targetTotalRevenue = targetHourlyRate * totalWorkTimeWithBuffer;
        const revenueDifference = targetTotalRevenue - totalRevenue;
        
        // Calculate total units across all loads (barrels/gallons)
        let totalUnits = 0;
        for (const load of sortedLoads) {
          if (load.rate_type !== 'flat_rate') {
            totalUnits += load.volume;
          }
        }
        
        // Calculate what the rate per unit would need to be
        let requiredRatePerUnit = 0;
        if (totalUnits > 0) {
          requiredRatePerUnit = targetTotalRevenue / totalUnits;
        }
        
        // Calculate the average current rate
        let currentAvgRatePerUnit = 0;
        if (totalUnits > 0) {
          currentAvgRatePerUnit = totalRevenue / totalUnits;
        }
        
        targetAnalysis = {
          target_hourly_rate: targetHourlyRate,
          target_total_revenue: targetTotalRevenue,
          revenue_difference: revenueDifference,
          meets_target: effectiveHourlyRate >= targetHourlyRate,
          percentage_of_target: targetHourlyRate > 0 ? (effectiveHourlyRate / targetHourlyRate) * 100 : 0,
          required_rate_per_unit: requiredRatePerUnit,
          current_avg_rate_per_unit: currentAvgRatePerUnit,
          rate_increase_needed: requiredRatePerUnit - currentAvgRatePerUnit,
          rate_increase_percentage: currentAvgRatePerUnit > 0 ? ((requiredRatePerUnit / currentAvgRatePerUnit - 1) * 100) : 0,
          total_units: totalUnits
        };
      }
      
      res.json({
        total_revenue: totalRevenue,
        total_drive_time_hours: totalDriveTimeHours,
        total_load_offload_hours: totalLoadOffloadHours,
        total_work_time_hours: totalWorkTimeWithBuffer,
        total_work_time_without_buffer: totalWorkTimeHours,
        traffic_buffer_hours: trafficBufferHours,
        total_miles: totalMiles,
        effective_hourly_rate: effectiveHourlyRate,
        deadhead_miles: deadheadMiles,
        deadhead_hours: deadheadHours,
        deadhead_start_miles: deadheadStartMiles,
        deadhead_start_hours: deadheadStartHours,
        deadhead_return_miles: deadheadReturnMiles,
        deadhead_return_hours: deadheadReturnHours,
        transition_miles: transitionMiles,
        transition_hours: transitionHours,
        load_calculations: loadCalculations,
        target_analysis: targetAnalysis,
        summary: {
          loads_count: sortedLoads.length,
          avg_revenue_per_load: sortedLoads.length > 0 ? totalRevenue / sortedLoads.length : 0,
          avg_miles_per_load: sortedLoads.length > 0 ? (totalMiles - deadheadMiles - transitionMiles) / sortedLoads.length : 0,
          transition_miles: transitionMiles,
          deadhead_percentage: totalMiles > 0 ? (deadheadMiles / totalMiles) * 100 : 0
        }
      });
    } catch (error: any) {
      console.error('Shift calculation error:', error);
      res.status(400).json({ error: error.message });
    }
  });
  
  // Route Templates API
  
  // Get all route templates
  app.get('/api/route-templates', async (req, res) => {
    try {
      const templates = await storage.getRouteTemplates();
      res.json(templates);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Get single route template
  app.get('/api/route-templates/:template_id', async (req, res) => {
    try {
      const template = await storage.getRouteTemplate(req.params.template_id);
      if (!template) {
        return res.status(404).json({ error: 'Route template not found' });
      }
      res.json(template);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Create route template
  app.post('/api/route-templates', async (req, res) => {
    try {
      const template = insertRouteTemplateSchema.parse(req.body);
      const newTemplate = await storage.createRouteTemplate(template);
      res.status(201).json(newTemplate);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Update route template
  app.patch('/api/route-templates/:template_id', async (req, res) => {
    try {
      const updates = insertRouteTemplateSchema.partial().parse(req.body);
      const updatedTemplate = await storage.updateRouteTemplate(req.params.template_id, updates);
      res.json(updatedTemplate);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  
  // Delete route template
  app.delete('/api/route-templates/:template_id', async (req, res) => {
    try {
      const deleted = await storage.deleteRouteTemplate(req.params.template_id);
      if (!deleted) {
        return res.status(404).json({ error: 'Route template not found' });
      }
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  // Bulk delete route templates
  app.delete('/api/route-templates/bulk', async (req, res) => {
    try {
      const { template_ids } = req.body;
      if (!Array.isArray(template_ids)) {
        return res.status(400).json({ error: 'template_ids must be an array' });
      }
      const deletedCount = await storage.deleteRouteTemplatesBulk(template_ids);
      res.json({ deleted: deletedCount });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Bulk upload contracted routes from CSV/Excel
  app.post('/api/upload/contracted-routes', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Fetch all existing routes, locations, and customers at the start
      const existingRoutes = await storage.getContractedRoutes();
      const locations = await storage.getLocations();
      const customers = await storage.getCustomers();
      
      // Create maps for efficient lookup
      const locationByName = new Map<string, Location>();
      for (const loc of locations) {
        locationByName.set(loc.name.toLowerCase(), loc);
      }
      
      const customerByName = new Map<string, Customer>();
      for (const cust of customers) {
        customerByName.set(cust.customer_name.toLowerCase(), cust);
      }
      
      const existingRouteNames = new Set(existingRoutes.map(r => r.route_name.toLowerCase()));

      const processedRoutes = [];
      const errors = [];
      let addedCount = 0;
      let skippedCount = 0;

      // Helper function to get column value with flexible matching
      const getColumnValue = (row: any, ...possibleKeys: string[]) => {
        const normalizedRow: { [key: string]: any } = {};
        for (const key in row) {
          const normalizedKey = key.trim().toLowerCase();
          normalizedRow[normalizedKey] = row[key];
        }

        for (const key of possibleKeys) {
          const normalizedKey = key.toLowerCase();
          if (normalizedRow[normalizedKey] !== undefined) {
            return normalizedRow[normalizedKey];
          }
        }
        return undefined;
      };

      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        const rowNumber = i + 2; // Account for header row

        // Extract fields with flexible column matching
        const routeName = getColumnValue(row, 'route_name', 'route name', 'name');
        const customerName = getColumnValue(row, 'customer_name', 'customer', 'client');
        const pickupName = getColumnValue(row, 'pickup_location', 'pickup', 'pickup location');
        const dropoffName = getColumnValue(row, 'dropoff_location', 'dropoff', 'dropoff location');
        const productType = getColumnValue(row, 'product_type', 'product', 'type');
        const avgVolume = getColumnValue(row, 'avg_volume', 'volume', 'average volume');
        const ratePerUnit = getColumnValue(row, 'rate_per_unit', 'rate', 'price');
        const rateType = getColumnValue(row, 'rate_type', 'rate type', 'pricing type');
        
        // Validate required fields
        if (!routeName || !pickupName || !dropoffName) {
          errors.push({ row: rowNumber, message: 'Missing required fields (route_name, pickup_location, or dropoff_location)' });
          continue;
        }

        // Find customer if specified
        let customer = null;
        if (customerName) {
          customer = customerByName.get(customerName.toLowerCase());
          if (!customer) {
            errors.push({ row: rowNumber, message: `Customer "${customerName}" not found` });
            continue;
          }
        }
        
        // Check for duplicate route names with same customer
        const duplicateRoute = existingRoutes.find(r => 
          r.route_name.toLowerCase() === routeName.toLowerCase() && 
          r.customer_id === customer?.customer_id
        );
        if (duplicateRoute) {
          const customerInfo = customer ? ` for customer "${customerName}"` : '';
          errors.push({ row: rowNumber, message: `Route "${routeName}"${customerInfo} already exists` });
          skippedCount++;
          continue;
        }

        // Find locations by name
        const pickupLocation = locationByName.get(pickupName.toLowerCase());
        const dropoffLocation = locationByName.get(dropoffName.toLowerCase());

        if (!pickupLocation) {
          errors.push({ row: rowNumber, message: `Pickup location "${pickupName}" not found` });
          continue;
        }

        if (!dropoffLocation) {
          errors.push({ row: rowNumber, message: `Dropoff location "${dropoffName}" not found` });
          continue;
        }

        // Validate pickup and dropoff are different
        if (pickupLocation.location_id === dropoffLocation.location_id) {
          errors.push({ row: rowNumber, message: 'Pickup and dropoff locations cannot be the same' });
          continue;
        }

        // Validate and normalize product type
        const normalizedProductType = productType ? productType.toLowerCase().trim() : 'both';
        if (!['crude', 'diesel', 'both'].includes(normalizedProductType)) {
          errors.push({ row: rowNumber, message: `Invalid product type "${productType}". Must be crude, diesel, or both` });
          continue;
        }

        // Validate and normalize rate type
        const normalizedRateType = rateType ? rateType.toLowerCase().replace(/\s+/g, '_') : 'per_barrel';
        if (!['per_barrel', 'per_gallon', 'flat_rate'].includes(normalizedRateType)) {
          errors.push({ row: rowNumber, message: `Invalid rate type "${rateType}". Must be per_barrel, per_gallon, or flat_rate` });
          continue;
        }

        try {
          const routeData: any = {
            route_name: routeName,
            customer_id: customer?.customer_id,
            pickup_location_id: pickupLocation.location_id,
            dropoff_location_id: dropoffLocation.location_id,
            product_type: normalizedProductType as "crude" | "diesel" | "both",
            avg_volume: parseFloat(avgVolume) || 0,
            rate_per_unit: parseFloat(ratePerUnit) || 0,
            rate_type: normalizedRateType as "per_barrel" | "per_gallon" | "flat_rate",
          };

          // Add optional fields if present
          const avgPickupTime = getColumnValue(row, 'avg_pickup_time', 'pickup time', 'pickup_time');
          const avgDropoffTime = getColumnValue(row, 'avg_dropoff_time', 'dropoff time', 'dropoff_time');
          const avgSpeed = getColumnValue(row, 'avg_speed', 'speed', 'average speed');
          const notes = getColumnValue(row, 'notes', 'note', 'comments');

          if (avgPickupTime) routeData.avg_pickup_time = parseFloat(avgPickupTime);
          if (avgDropoffTime) routeData.avg_dropoff_time = parseFloat(avgDropoffTime);
          if (avgSpeed) routeData.avg_speed = parseFloat(avgSpeed);
          if (notes) routeData.notes = String(notes);

          const route = await storage.createContractedRoute(routeData);
          processedRoutes.push(route);
          addedCount++;
          existingRouteNames.add(routeName.toLowerCase()); // Add to set to prevent duplicates within the upload
        } catch (error: any) {
          errors.push({ row: rowNumber, message: error.message });
        }
      }

      res.json({
        success: true,
        addedCount,
        skippedCount,
        totalProcessed: data.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Config endpoints
  app.get('/api/config', async (req, res) => {
    try {
      const config = await storage.getConfig();
      const { admin_pin, ...safeConfig } = config as any;
      res.json(safeConfig);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get config' });
    }
  });

  app.put('/api/config', async (req, res) => {
    try {
      const updates = configSchema.partial().parse(req.body);
      const config = await storage.updateConfig(updates);
      res.json(config);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  app.post('/api/verify-pin', async (req, res) => {
    try {
      const { pin } = req.body;
      if (!pin || typeof pin !== 'string') {
        return res.status(400).json({ valid: false, error: 'PIN required' });
      }
      
      const config = await storage.getConfig();
      
      if (!config.pin_enabled || !config.admin_pin) {
        return res.json({ valid: true });
      }
      
      const valid = config.admin_pin === pin;
      res.json({ valid });
    } catch (error) {
      res.status(500).json({ valid: false, error: 'Failed to verify PIN' });
    }
  });

  app.post('/api/set-pin', async (req, res) => {
    try {
      const { pin, currentPin } = req.body;
      
      const config = await storage.getConfig();
      
      if (config.pin_enabled && config.admin_pin) {
        if (!currentPin || currentPin !== config.admin_pin) {
          return res.status(403).json({ error: 'Current PIN is incorrect' });
        }
      }
      
      if (pin && pin.length >= 4 && pin.length <= 10) {
        await storage.updateConfig({ admin_pin: pin, pin_enabled: true });
        res.json({ success: true, message: 'PIN set successfully' });
      } else if (pin === null || pin === '') {
        await storage.updateConfig({ admin_pin: undefined, pin_enabled: false });
        res.json({ success: true, message: 'PIN disabled' });
      } else {
        res.status(400).json({ error: 'PIN must be 4-10 digits' });
      }
    } catch (error) {
      res.status(500).json({ error: 'Failed to set PIN' });
    }
  });

  // Route overrides endpoints
  app.get('/api/overrides', async (req, res) => {
    try {
      const overrides = await storage.getRouteOverrides();
      res.json(overrides);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get route overrides' });
    }
  });

  app.post('/api/overrides', async (req, res) => {
    try {
      const overrideData = routeOverrideSchema.parse(req.body);
      const override = await storage.createRouteOverride(overrideData);
      res.json(override);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });

  // Google Maps routes endpoint
  app.post('/api/routes', async (req, res) => {
    try {
      const request = routeRequestSchema.parse(req.body);
      
      // Validate that coordinates are present
      if (!request.origin.lat || !request.origin.lon) {
        return res.status(400).json({ 
          error: 'Origin location is missing GPS coordinates. Please add latitude and longitude before calculating routes.' 
        });
      }
      
      if (!request.destination.lat || !request.destination.lon) {
        return res.status(400).json({ 
          error: 'Destination location is missing GPS coordinates. Please add latitude and longitude before calculating routes.' 
        });
      }
      
      // Check cache first
      const routeKey = generateRouteKey(request.origin, request.destination, request.waypoints);
      const cached = await storage.getRouteCache(routeKey);
      
      // Cache for 30 days
      const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
      
      if (cached && (Date.now() - cached.created_at) < CACHE_TTL) {
        return res.json({ routes: cached.routes });
      }

      // Fetch from Google Maps
      const routes = await getGoogleMapsRoutes(request);
      
      // Cache the results
      await storage.setRouteCache(routeKey, {
        created_at: Date.now(),
        routes,
      });

      res.json({ routes });
    } catch (error: any) {
      console.error('Route calculation error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Batch calculation endpoint
  app.post('/api/calculate-batch', async (req, res) => {
    try {
      const { batch_mode_type = 'collection', ...baseRequest } = req.body;
      
      const locations = await storage.getLocations();
      const config = await storage.getConfig();
      
      const results = [];
      
      // Generate pairs based on batch mode type
      let routePairs = [];
      
      if (batch_mode_type === 'collection') {
        // Collection: Many pickups to one dropoff
        const { pickup_location_ids, dropoff_location_id } = baseRequest;
        
        if (!pickup_location_ids || !Array.isArray(pickup_location_ids) || pickup_location_ids.length === 0) {
          return res.status(400).json({ error: 'pickup_location_ids must be a non-empty array for collection mode' });
        }
        if (!dropoff_location_id) {
          return res.status(400).json({ error: 'dropoff_location_id is required for collection mode' });
        }
        
        for (const pickupId of pickup_location_ids) {
          routePairs.push({ pickupId, dropoffId: dropoff_location_id });
        }
        
      } else if (batch_mode_type === 'distribution') {
        // Distribution: One pickup to many dropoffs
        const { pickup_location_id, dropoff_location_ids } = baseRequest;
        
        if (!pickup_location_id) {
          return res.status(400).json({ error: 'pickup_location_id is required for distribution mode' });
        }
        if (!dropoff_location_ids || !Array.isArray(dropoff_location_ids) || dropoff_location_ids.length === 0) {
          return res.status(400).json({ error: 'dropoff_location_ids must be a non-empty array for distribution mode' });
        }
        
        for (const dropoffId of dropoff_location_ids) {
          routePairs.push({ pickupId: pickup_location_id, dropoffId });
        }
        
      } else if (batch_mode_type === 'matrix') {
        // Matrix: Many pickups to many dropoffs  
        const { pickup_location_ids, dropoff_location_ids } = baseRequest;
        
        if (!pickup_location_ids || !Array.isArray(pickup_location_ids) || pickup_location_ids.length === 0) {
          return res.status(400).json({ error: 'pickup_location_ids must be a non-empty array for matrix mode' });
        }
        if (!dropoff_location_ids || !Array.isArray(dropoff_location_ids) || dropoff_location_ids.length === 0) {
          return res.status(400).json({ error: 'dropoff_location_ids must be a non-empty array for matrix mode' });
        }
        
        for (const pickupId of pickup_location_ids) {
          for (const dropoffId of dropoff_location_ids) {
            routePairs.push({ pickupId, dropoffId });
          }
        }
        
      } else {
        return res.status(400).json({ error: 'Invalid batch_mode_type. Must be "collection", "distribution", or "matrix"' });
      }
      
      // Process each route pair
      for (const { pickupId, dropoffId } of routePairs) {
        const pickup = locations.find(l => l.location_id === pickupId);
        const dropoff = locations.find(l => l.location_id === dropoffId);
        
        if (!pickup || !dropoff) {
          results.push({
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            error: 'Invalid pickup or dropoff location'
          });
          continue;
        }

        // Check if locations have coordinates
        if (pickup.lat === undefined || pickup.lat === null || pickup.lon === undefined || pickup.lon === null) {
          results.push({
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            pickup_name: pickup.name,
            error: `Location '${pickup.name}' is missing GPS coordinates. Please add latitude and longitude for this location before calculating routes.`
          });
          continue;
        }

        if (dropoff.lat === undefined || dropoff.lat === null || dropoff.lon === undefined || dropoff.lon === null) {
          results.push({
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            pickup_name: pickup.name,
            error: `Location '${dropoff.name}' is missing GPS coordinates. Please add latitude and longitude for this location before calculating routes.`
          });
          continue;
        }

        try {
          // Use override units if provided, otherwise use location-specific default
          const locationUnits = baseRequest.units_loaded !== undefined ? baseRequest.units_loaded : (pickup.default_units_loaded || 155);
          
          // Use location-specific load/unload times if not overridden
          // Priority: 1) Form override (sent as defined value), 2) Location default, 3) 60 min fallback
          const pickupTimeMin = baseRequest.pickup_time_min !== undefined 
            ? baseRequest.pickup_time_min 
            : (pickup.default_pickup_min ?? 60);
          const dropoffTimeMin = baseRequest.dropoff_time_min !== undefined 
            ? baseRequest.dropoff_time_min 
            : (dropoff.default_dropoff_min ?? 60);
          
          // Get routes from Google Maps
          const routeRequest = {
            origin: { lat: pickup.lat, lon: pickup.lon },
            destination: { lat: dropoff.lat, lon: dropoff.lon },
            alternatives: true,
          };

          const routeKey = generateRouteKey(routeRequest.origin, routeRequest.destination);
          let routes;
          
          const cached = await storage.getRouteCache(routeKey);
          const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
          
          if (cached && (Date.now() - cached.created_at) < CACHE_TTL) {
            routes = cached.routes;
          } else {
            routes = await getGoogleMapsRoutes(routeRequest);
            await storage.setRouteCache(routeKey, {
              created_at: Date.now(),
              routes,
            });
          }

          // Calculate rates for each route (limit to 4 routes max)
          const limitedRoutes = routes.slice(0, 4);
          const request = { 
            ...baseRequest, 
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            units_loaded: locationUnits,
            pickup_time_min: pickupTimeMin,
            dropoff_time_min: dropoffTimeMin,
          };
          const calculations = await calculateRates(request, limitedRoutes, locations, config, storage);
          
          results.push({
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            pickup_name: pickup.name,
            pickup_lat: pickup.lat,
            pickup_lon: pickup.lon,
            dropoff_name: dropoff.name,
            dropoff_lat: dropoff.lat,
            dropoff_lon: dropoff.lon,
            units_loaded: locationUnits,
            pickup_time_min: pickupTimeMin,
            dropoff_time_min: dropoffTimeMin,
            calculations: calculations.map((calc, index) => ({
              route_number: index + 1,
              route_summary: calc.summary,
              distance_miles: calc.distance_miles,
              total_miles: calc.total_miles,
              empty_miles: calc.empty_miles,
              base_to_pickup_miles: calc.base_to_pickup_miles,
              dropoff_to_base_miles: calc.dropoff_to_base_miles,
              total_time_hr: calc.total_time_hr,
              drive_time_hr: calc.drive_time_hr,
              pickup_time_hr: calc.pickup_time_hr,
              dropoff_time_hr: calc.dropoff_time_hr,
              traffic_buffer_hr: calc.traffic_buffer_hr,
              rate_per_unit: calc.rate_per_unit,
              rate_per_mile_total: calc.rate_per_mile_total,
              required_revenue: calc.required_revenue,
              polyline: calc.polyline,
              distance_text: calc.distance_text,
              duration_text: calc.duration_text,
            }))
          });
        } catch (error: any) {
          results.push({
            pickup_location_id: pickupId,
            dropoff_location_id: dropoffId,
            pickup_name: pickup.name,
            error: error.message
          });
        }
      }

      res.json({
        batch_mode_type,
        load_type: baseRequest.load_type,
        include_deadhead: baseRequest.include_deadhead || false,
        deadhead_type: baseRequest.deadhead_type || 'none',
        // Include calculation parameters for export
        avg_mph: baseRequest.avg_mph,
        pickup_time_min: baseRequest.pickup_time_min,
        dropoff_time_min: baseRequest.dropoff_time_min,
        traffic_buffer_min: baseRequest.traffic_buffer_min,
        hourly_target_usd: baseRequest.hourly_target_usd,
        results,
      });
    } catch (error: any) {
      console.error('Batch calculation error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Recalculate rates for a user-modified (dragged) route.
  // Accepts the same parameters as /api/calculate plus a `route` override with
  // the dragged route's distance/duration; skips the Google Directions fetch
  // and re-runs the same rate engine against the custom route.
  app.post('/api/recalculate-route', async (req, res) => {
    try {
      const recalcSchema = calculationRequestSchema.extend({
        route: z.object({
          miles: z.number().positive(),
          summary: z.string().optional(),
          polyline: z.string().optional(),
        }),
      });
      const { route: routeOverride, ...request } = recalcSchema.parse(req.body);

      const locations = await storage.getLocations();
      const config = await storage.getConfig();

      // Note: the rate engine (calculateRates) intentionally derives drive
      // time from distance / avg_mph — the same as every other route in the
      // app — so only the dragged route's distance is accepted here. Google's
      // duration is not part of the rate contract anywhere in the engine.
      const totalMiles = routeOverride.miles;
      const totalHours = totalMiles / request.avg_mph;
      const route = {
        id: 'custom-route',
        route_id: 'custom-route',
        summary: routeOverride.summary || 'Custom route',
        miles: totalMiles,
        distance_miles: totalMiles,
        duration_hours: totalHours,
        distance_text: `${totalMiles.toFixed(1)} mi`,
        duration_text: `${Math.floor(totalHours)}h ${Math.round((totalHours % 1) * 60)}m`,
        polyline: routeOverride.polyline,
      };

      const calculations = await calculateRates(request, [route], locations, config, storage);
      res.json({ calculation: calculations[0] });
    } catch (error: any) {
      console.error('Route recalculation error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Rate calculation endpoint
  app.post('/api/calculate', async (req, res) => {
    try {
      const request = calculationRequestSchema.parse(req.body);
      
      // Get locations and config
      const locations = await storage.getLocations();
      const config = await storage.getConfig();
      
      const pickup = locations.find(l => l.location_id === request.pickup_location_id);
      const dropoff = locations.find(l => l.location_id === request.dropoff_location_id);
      
      if (!pickup || !dropoff) {
        return res.status(400).json({ error: 'Invalid pickup or dropoff location' });
      }

      // Check if locations have coordinates
      if (pickup.lat === undefined || pickup.lat === null || pickup.lon === undefined || pickup.lon === null) {
        return res.status(400).json({ 
          error: `Location '${pickup.name}' is missing GPS coordinates. Please add latitude and longitude for this location before calculating routes.` 
        });
      }

      if (dropoff.lat === undefined || dropoff.lat === null || dropoff.lon === undefined || dropoff.lon === null) {
        return res.status(400).json({ 
          error: `Location '${dropoff.name}' is missing GPS coordinates. Please add latitude and longitude for this location before calculating routes.` 
        });
      }

      // Get routes from Google Maps
      const routeRequest = {
        origin: { lat: pickup.lat, lon: pickup.lon },
        destination: { lat: dropoff.lat, lon: dropoff.lon },
        alternatives: true,
      };

      const routeKey = generateRouteKey(routeRequest.origin, routeRequest.destination);
      let routes;
      
      const cached = await storage.getRouteCache(routeKey);
      const CACHE_TTL = 30 * 24 * 60 * 60 * 1000;
      
      if (cached && (Date.now() - cached.created_at) < CACHE_TTL) {
        routes = cached.routes;
      } else {
        routes = await getGoogleMapsRoutes(routeRequest);
        await storage.setRouteCache(routeKey, {
          created_at: Date.now(),
          routes,
        });
      }

      // Append any saved custom (dragged) routes for this pickup/dropoff pair
      // so they appear alongside Google's alternatives and can be reused.
      const contractedRoutes = await storage.getContractedRoutes();
      const savedCustomRoutes = contractedRoutes
        .filter((cr: any) =>
          cr.custom_miles &&
          cr.pickup_location_id === request.pickup_location_id &&
          cr.dropoff_location_id === request.dropoff_location_id &&
          (cr.product_type === 'both' || cr.product_type === request.load_type)
        )
        .map((cr: any) => {
          const miles = cr.custom_miles as number;
          const hours = miles / request.avg_mph;
          return {
            id: `saved_${cr.route_id}`,
            route_id: `saved_${cr.route_id}`,
            summary: cr.route_name,
            is_saved_custom: true,
            saved_route_id: cr.route_id,
            miles,
            distance_miles: miles,
            duration_hours: hours,
            distance_text: `${miles.toFixed(1)} mi`,
            duration_text: `${Math.floor(hours)}h ${Math.round((hours % 1) * 60)}m`,
            polyline: cr.custom_polyline,
          };
        });
      const allRoutes = [...routes, ...savedCustomRoutes];

      // Calculate rates for each route
      const calculations = await calculateRates(request, allRoutes, locations, config, storage);
      
      // Determine which base yard coordinates to return
      let baseLat = config.base_lat;
      let baseLon = config.base_lon;
      
      if (request.base_yard_id) {
        const selectedBaseYard = locations.find(l => l.location_id === request.base_yard_id && (l.role === 'yard' || l.is_base_yard));
        if (selectedBaseYard) {
          baseLat = selectedBaseYard.lat;
          baseLon = selectedBaseYard.lon;
        }
      }
      
      res.json({
        pickup: pickup.name,
        dropoff: dropoff.name,
        pickup_location_id: request.pickup_location_id,
        dropoff_location_id: request.dropoff_location_id,
        load_type: request.load_type,
        units_loaded: request.units_loaded,
        include_deadhead: request.include_deadhead,
        base_lat: baseLat,
        base_lon: baseLon,
        locations: {
          [request.pickup_location_id]: pickup,
          [request.dropoff_location_id]: dropoff,
        },
        calculations,
      });
    } catch (error: any) {
      console.error('Calculation error:', error);
      res.status(400).json({ error: error.message });
    }
  });

  // Scenario endpoints
  // TODO: Implement scenario storage methods
  /*
  app.get('/api/scenarios', async (req, res) => {
    try {
      const scenarios = await storage.getScenarios();
      res.json(scenarios);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  */

  /*
  app.post('/api/scenarios', async (req, res) => {
    try {
      const scenarioData = insertScenarioSchema.parse(req.body);
      const scenario = await storage.createScenario(scenarioData);
      res.json(scenario);
    } catch (error: any) {
      console.error('Scenario creation error:', error);
      res.status(400).json({ error: error.message });
    }
  });
  */

  /*
  app.get('/api/scenarios/:id', async (req, res) => {
    try {
      const scenario = await storage.getScenario(req.params.id);
      if (!scenario) {
        return res.status(404).json({ error: 'Scenario not found' });
      }
      res.json(scenario);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  */

  /*
  app.put('/api/scenarios/:id', async (req, res) => {
    try {
      const updates = req.body;
      const scenario = await storage.updateScenario(req.params.id, updates);
      res.json(scenario);
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  */

  /*
  app.delete('/api/scenarios/:id', async (req, res) => {
    try {
      await storage.deleteScenario(req.params.id);
      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ error: error.message });
    }
  });
  */

  // File upload endpoints
  app.post('/api/upload/locations', upload.single('file'), async (req: Request & { file?: Express.Multer.File }, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const workbook = XLSX.readFile(req.file.path);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      // Fetch all existing locations at the start
      const existingLocations = await storage.getLocations();
      const existingByName = new Map<string, Location>();
      for (const loc of existingLocations) {
        existingByName.set(loc.name.toLowerCase(), loc);
      }

      const processedLocations = [];
      const errors = [];
      const allWarnings = []; // Track all warnings
      let addedCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      // Helper function to normalize role values to accepted schema values
      const normalizeRole = (role: any): "pickup" | "dropoff" | "both" | "yard" => {
        if (!role) return "both";
        
        const normalizedRole = String(role).toLowerCase().trim();
        
        // Check for exact matches first
        if (normalizedRole === "pickup") return "pickup";
        if (normalizedRole === "dropoff") return "dropoff";
        if (normalizedRole === "both") return "both";
        if (normalizedRole === "yard") return "yard";
        
        // Check for common variations
        const roleMap: { [key: string]: "pickup" | "dropoff" | "both" | "yard" } = {
          // Dropoff variations
          "depo": "dropoff",
          "depot": "dropoff",
          "drop": "dropoff",
          "do": "dropoff",
          "delivery": "dropoff",
          "destination": "dropoff",
          
          // Pickup variations
          "pick": "pickup",
          "pu": "pickup",
          "origin": "pickup",
          "source": "pickup",
          
          // Yard variations
          "base": "yard",
          "terminal": "yard",
          "hub": "yard"
        };
        
        // Check if the normalized role matches any variation
        if (roleMap[normalizedRole]) {
          return roleMap[normalizedRole];
        }
        
        // Default to "both" if no match found
        return "both";
      };

      // Helper function to get column value with flexible matching (trim spaces and case-insensitive)
      const getColumnValue = (row: any, ...possibleKeys: string[]) => {
        // Create a normalized key map (trimmed, lowercase)
        const normalizedRow: { [key: string]: any } = {};
        for (const key in row) {
          const normalizedKey = key.trim().toLowerCase();
          normalizedRow[normalizedKey] = row[key];
        }

        // Try to find a matching key
        for (const key of possibleKeys) {
          const normalizedKey = key.toLowerCase();
          if (normalizedRow[normalizedKey] !== undefined) {
            return normalizedRow[normalizedKey];
          }
        }
        return undefined;
      };

      // Helper function to compare locations
      const locationsAreIdentical = (existing: Location, newData: any): boolean => {
        // Compare all relevant fields
        if (existing.role !== newData.role) return false;
        if (Math.abs(existing.lat - newData.lat) > 0.000001) return false; // Small tolerance for float comparison
        if (Math.abs(existing.lon - newData.lon) > 0.000001) return false;
        if (existing.allowed_load_types !== newData.allowed_load_types) return false;
        
        // Compare optional fields - treat undefined and null as equivalent
        const compareOptional = (existingVal: any, newVal: any) => {
          if (existingVal === undefined || existingVal === null) {
            return newVal === undefined || newVal === null;
          }
          return existingVal === newVal;
        };

        if (!compareOptional(existing.default_units_loaded, newData.default_units_loaded)) return false;
        if (!compareOptional(existing.default_pickup_min, newData.default_pickup_min)) return false;
        if (!compareOptional(existing.default_dropoff_min, newData.default_dropoff_min)) return false;
        if (!compareOptional(existing.pickup_queue_min, newData.pickup_queue_min)) return false;
        if (!compareOptional(existing.dropoff_queue_min, newData.dropoff_queue_min)) return false;
        if (!compareOptional(existing.api_gravity, newData.api_gravity)) return false;
        if (!compareOptional(existing.avg_speed, newData.avg_speed)) return false;
        if (!compareOptional(existing.notes, newData.notes || '')) return false;
        if (!compareOptional(existing.is_base_yard, newData.is_base_yard)) return false;

        return true;
      };

      for (let index = 0; index < data.length; index++) {
        const row = data[index] as any;
        const rowNumber = index + 2; // Excel row numbers start at 1, plus header row
        
        try {
          // Get location name first for better error messages
          const locationName = getColumnValue(row, 'name', 'location_name', 'location') || `Row ${rowNumber}`;
          
          // Get latitude with flexible column matching
          const latValue = getColumnValue(row, 'lat', 'latitude');
          
          // Get longitude with flexible column matching - user prefers 'long' over 'lon'
          const lonValue = getColumnValue(row, 'long', 'lon', 'lng', 'longitude');

          // Parse coordinates - allow missing or invalid values
          let latitude: number | undefined;
          let longitude: number | undefined;
          const warnings = [];

          // Process latitude
          if (latValue === undefined || latValue === null || latValue === '') {
            warnings.push(`Missing latitude for location '${locationName}' at row ${rowNumber}`);
            latitude = undefined;
          } else {
            const parsedLat = parseFloat(latValue);
            if (isNaN(parsedLat)) {
              warnings.push(`Invalid latitude value '${latValue}' for location '${locationName}' at row ${rowNumber}. Setting to undefined.`);
              latitude = undefined;
            } else {
              latitude = parsedLat;
            }
          }

          // Process longitude  
          if (lonValue === undefined || lonValue === null || lonValue === '') {
            warnings.push(`Missing longitude for location '${locationName}' at row ${rowNumber}`);
            longitude = undefined;
          } else {
            const parsedLon = parseFloat(lonValue);
            if (isNaN(parsedLon)) {
              warnings.push(`Invalid longitude value '${lonValue}' for location '${locationName}' at row ${rowNumber}. Setting to undefined.`);
              longitude = undefined;
            } else {
              longitude = parsedLon;
            }
          }

          // Flag coordinates that fall outside the operating region (likely typos)
          if (latitude !== undefined && longitude !== undefined && !isWithinOperatingRegion(latitude, longitude)) {
            warnings.push(`Coordinates (${latitude}, ${longitude}) for location '${locationName}' at row ${rowNumber} fall outside the expected ${OPERATING_REGION.label} — they may be a typo.`);
          }

          // Add warnings to the global warnings list
          if (warnings.length > 0) {
            allWarnings.push(...warnings.map(warning => ({
              row: rowNumber,
              location: locationName,
              warning
            })));
          }

          // Map CSV columns to schema with user-friendly column name mappings
          // Note: Template uses user-friendly names, we map them to database field names
          const locationData: any = {
            name: locationName,
            role: normalizeRole(getColumnValue(row, 'role')),
            lat: latitude, // May be undefined
            lon: longitude, // May be undefined
            // Map 'product_types' from template to 'allowed_load_types' in database
            allowed_load_types: getColumnValue(row, 'product_types', 'allowed_load_types', 'load_types') || 'crude,diesel',
            default_units_loaded: undefined, // Will be set below from 'default_volume'
            default_pickup_min: undefined,   // Will be set below from 'pickup_time'
            default_dropoff_min: undefined,  // Will be set below from 'dropoff_time'
            pickup_queue_min: undefined,
            dropoff_queue_min: undefined,
            api_gravity: undefined,
            avg_speed: undefined, // New field for average speed in mph
            notes: getColumnValue(row, 'notes') || '',
            is_base_yard: undefined,
          };

          // Parse optional boolean field
          const isBaseYardValue = getColumnValue(row, 'is_base_yard', 'base_yard');
          if (isBaseYardValue !== undefined && isBaseYardValue !== null && isBaseYardValue !== '') {
            // Handle string values like "true", "false", "yes", "no", etc.
            const strValue = String(isBaseYardValue).toLowerCase().trim();
            locationData.is_base_yard = strValue === 'true' || strValue === 'yes' || strValue === '1';
          }

          // Parse optional numeric fields with user-friendly column name mappings
          // Map 'default_volume' to 'default_units_loaded'
          // IMPORTANT: Diesel volumes are in GALLONS, Crude oil volumes are in BARRELS
          const unitsValue = getColumnValue(row, 'default_volume', 'default_units_loaded', 'units_loaded', 'units');
          if (unitsValue !== undefined && unitsValue !== null && unitsValue !== '') {
            const units = parseInt(unitsValue);
            if (!isNaN(units)) {
              locationData.default_units_loaded = units;
            }
          }

          // Flag missing default load size for roles that require it (pickup/both, non-yard)
          const loadSizeIssue = getLocationIssues(locationData).find(issue => issue.code === 'missing_load_size');
          if (loadSizeIssue) {
            allWarnings.push({
              row: rowNumber,
              location: locationName,
              warning: `${loadSizeIssue.message} for location '${locationName}' at row ${rowNumber}.`,
            });
          }

          // Map 'pickup_time' to 'default_pickup_min' (time in minutes)
          const pickupMinValue = getColumnValue(row, 'pickup_time', 'default_pickup_min', 'pickup_min');
          if (pickupMinValue !== undefined && pickupMinValue !== null && pickupMinValue !== '') {
            const value = parseInt(pickupMinValue);
            if (!isNaN(value)) {
              locationData.default_pickup_min = value;
            }
          }

          // Map 'dropoff_time' to 'default_dropoff_min' (time in minutes)
          const dropoffMinValue = getColumnValue(row, 'dropoff_time', 'default_dropoff_min', 'dropoff_min');
          if (dropoffMinValue !== undefined && dropoffMinValue !== null && dropoffMinValue !== '') {
            const value = parseInt(dropoffMinValue);
            if (!isNaN(value)) {
              locationData.default_dropoff_min = value;
            }
          }

          // Parse new avg_speed field (average speed in mph)
          const avgSpeedValue = getColumnValue(row, 'avg_speed', 'average_speed', 'speed');
          if (avgSpeedValue !== undefined && avgSpeedValue !== null && avgSpeedValue !== '') {
            const value = parseInt(avgSpeedValue);
            if (!isNaN(value)) {
              locationData.avg_speed = value;
            }
          }

          const pickupQueueValue = getColumnValue(row, 'pickup_queue_min', 'pickup_queue');
          if (pickupQueueValue !== undefined && pickupQueueValue !== null && pickupQueueValue !== '') {
            const value = parseInt(pickupQueueValue);
            if (!isNaN(value)) {
              locationData.pickup_queue_min = value;
            }
          }

          const dropoffQueueValue = getColumnValue(row, 'dropoff_queue_min', 'dropoff_queue');
          if (dropoffQueueValue !== undefined && dropoffQueueValue !== null && dropoffQueueValue !== '') {
            const value = parseInt(dropoffQueueValue);
            if (!isNaN(value)) {
              locationData.dropoff_queue_min = value;
            }
          }

          const apiGravityValue = getColumnValue(row, 'api_gravity', 'api');
          if (apiGravityValue !== undefined && apiGravityValue !== null && apiGravityValue !== '') {
            const value = parseFloat(apiGravityValue);
            if (!isNaN(value)) {
              locationData.api_gravity = value;
            }
          }

          // No geographic validation - support locations worldwide
          // Coordinates are validated as numbers by the schema

          // Check if location exists by name
          const existingLocation = existingByName.get(locationName.toLowerCase());
          
          if (existingLocation) {
            // Location exists - check if it needs updating or should be skipped
            if (locationsAreIdentical(existingLocation, locationData)) {
              // Skip - identical data
              skippedCount++;
              processedLocations.push({
                ...existingLocation,
                action: 'skipped',
                row: rowNumber,
              });
            } else {
              // Update - data has changed
              const validated = insertLocationSchema.parse(locationData);
              // Preserve the existing location_id
              const updatedLocation = await storage.updateLocation(existingLocation.location_id, validated);
              if (!updatedLocation) {
                // Record was removed concurrently; nothing to update.
                processedLocations.push({
                  ...existingLocation,
                  action: 'skipped',
                  row: rowNumber,
                });
              } else {
                updatedCount++;
                processedLocations.push({
                  ...updatedLocation,
                  action: 'updated',
                  row: rowNumber,
                });
                // Update the map with the new data
                existingByName.set(locationName.toLowerCase(), updatedLocation);
              }
            }
          } else {
            // New location - create it
            const validated = insertLocationSchema.parse(locationData);
            const newLocation = await storage.createLocation(validated);
            addedCount++;
            processedLocations.push({
              ...newLocation,
              action: 'added',
              row: rowNumber,
            });
            // Add to the map for future duplicate checks within the same upload
            existingByName.set(locationName.toLowerCase(), newLocation);
          }
        } catch (error: any) {
          // Check if it's a Zod validation error
          if (error.name === 'ZodError') {
            const zodErrors = JSON.parse(error.message);
            const errorMessages = zodErrors.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ');
            errors.push({
              row: rowNumber,
              location: getColumnValue(row, 'name', 'location_name', 'location') || `Row ${rowNumber}`,
              error: `Validation error: ${errorMessages}`,
            });
          } else {
            errors.push({
              row: rowNumber,
              location: getColumnValue(row, 'name', 'location_name', 'location') || `Row ${rowNumber}`,
              error: error.message,
            });
          }
        }
      }

      res.json({
        success: true,
        total_rows: data.length,
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount,
        imported: addedCount + updatedCount, // For backward compatibility
        errors,
        warnings: allWarnings, // Include warnings in response
        locations: processedLocations,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Export Quote as styled Excel file
  app.post('/api/export-quote', async (req, res) => {
    try {
      const { routes, loadType } = req.body;
      
      if (!routes || !Array.isArray(routes) || routes.length === 0) {
        return res.status(400).json({ error: 'No routes provided' });
      }

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Rate Quote');

      // Set column widths
      worksheet.columns = [
        { width: 30 },  // LEASE NAME
        { width: 40 },  // DELIVERY LOCATION
        { width: 30 },  // TRANSPORTATION RATES/BBL
        { width: 18 },  // ONE-WAY MILES
        { width: 18 },  // TOTAL MILES
      ];

      // Style definitions
      const greenFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF90EE90' }  // Light green
      };
      const orangeFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFA500' }  // Orange
      };
      const yellowFill: ExcelJS.Fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFFFF99' }  // Light yellow
      };
      const thinBorder: Partial<ExcelJS.Borders> = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      };

      // Row 1: Header row (green fill, bold)
      const headerRow = worksheet.addRow(['LEASE NAME', 'DELIVERY LOCATION', 'TRANSPORTATION RATES/BBL', 'ONE-WAY MILES', 'TOTAL MILES']);
      headerRow.eachCell((cell) => {
        cell.fill = greenFill;
        cell.font = { bold: true };
        cell.border = thinBorder;
      });

      // Data rows (no fill, just borders)
      routes.forEach((route: { pickup: string; dropoff: string; rate: number; oneWayMiles?: number; totalMiles?: number }) => {
        const dataRow = worksheet.addRow([
          route.pickup,
          route.dropoff,
          `$${route.rate.toFixed(2)}`,
          route.oneWayMiles != null ? `${route.oneWayMiles.toFixed(1)} mi` : '',
          route.totalMiles != null ? `${route.totalMiles.toFixed(1)} mi` : ''
        ]);
        dataRow.eachCell((cell) => {
          cell.border = thinBorder;
        });
      });

      // Empty rows for additional entries (with borders)
      for (let i = 0; i < 2; i++) {
        const emptyRow = worksheet.addRow(['', '', '', '', '']);
        emptyRow.eachCell((cell) => {
          cell.border = thinBorder;
        });
      }

      // ACCESSORIAL CHARGES row (orange fill, bold)
      const accessorialRow = worksheet.addRow(['ACCESSORIAL CHARGES', '', '', '', '']);
      accessorialRow.eachCell((cell) => {
        cell.fill = orangeFill;
        cell.font = { bold: true };
        cell.border = thinBorder;
      });

      // Accessorial detail rows (yellow fill)
      const accessorialData = [
        ['MINIMUM LOAD', 'LESS THAN 26 API', '150 BBLS', '', ''],
        ['', 'GREATER THAN 26 API', '165 BBLS', '', ''],
        ['DEMURRAGE', 'AFTER ONE HOUR - LOAD & OFFLOAD', '$100 PER/HR (1/4 HR INCREMENTS)', '', ''],
        ['RETURN LOAD/REJECT', '', '1.5 TIMES MINIMUM LOAD', '', ''],
        ['', '', '', '', '']
      ];

      accessorialData.forEach((rowData) => {
        const row = worksheet.addRow(rowData);
        row.eachCell((cell) => {
          cell.fill = yellowFill;
          cell.border = thinBorder;
        });
      });

      // Fuel adjustment footer row (yellow fill, bold, centered in column B)
      const fuelRow = worksheet.addRow(['', 'Pricing subject to fuel adjustment at $5.50/Gal Diesel', '', '', '']);
      fuelRow.eachCell((cell) => {
        cell.fill = yellowFill;
        cell.border = thinBorder;
      });
      // Make column B bold
      fuelRow.getCell(2).font = { bold: true };

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();

      // Set headers for file download
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=rate-quote-${new Date().toISOString().split('T')[0]}.xlsx`);
      res.send(buffer);

    } catch (error: any) {
      console.error('Error generating Excel quote:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
