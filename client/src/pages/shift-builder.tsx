import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Plus, Trash2, Route, Calendar, MapPin, Package, ChevronRight, Save, Calculator, AlertCircle, CheckCircle, FileText, Copy, GripVertical } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Location, Shift, InsertShift, ContractedRoute, Customer, Config } from "@shared/schema";
import { insertShiftSchema } from "@shared/schema";
import SegmentRouteMap from "@/components/shift-builder/segment-route-map";

// Define types for route segments and loads
interface LoadRoute {
  load_order: number;
  customer_id?: string; // Customer for this specific load (optional for N/A)
  pickup_location_id: string;
  dropoff_location_id: string;
  product_type: 'crude' | 'diesel';
  volume: number;
  rate_per_unit: number;
  rate_type: string;
  pickup_time_min: number;
  dropoff_time_min: number;
  selected_route?: any; // Will store the selected route from Google Maps
  using_contracted_rate?: boolean; // Track if using contracted rate
  contracted_route_id?: string; // Track which contracted route is matched
}

interface RouteSegment {
  segment_type: 'base_to_pickup' | 'pickup_to_dropoff' | 'dropoff_to_pickup' | 'dropoff_to_base';
  from_location_id: string;
  to_location_id: string;
  available_routes?: any[];
  selected_route?: any;
  load_index?: number;
}

// Sortable Load Item Component
interface SortableLoadItemProps {
  load: LoadRoute;
  index: number;
  customers: Customer[];
  pickupLocations: Location[];
  dropoffLocations: Location[];
  updateLoad: (index: number, field: keyof LoadRoute, value: any) => void;
  duplicateLoad: (index: number) => void;
  removeLoad: (index: number) => void;
}

function SortableLoadItem({ 
  load, 
  index, 
  customers, 
  pickupLocations, 
  dropoffLocations, 
  updateLoad, 
  duplicateLoad, 
  removeLoad 
}: SortableLoadItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: index });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="card-metallic p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            className="cursor-grab active:cursor-grabbing touch-none p-1 hover:bg-muted rounded"
            {...attributes}
            {...listeners}
            data-testid={`drag-handle-${index}`}
          >
            <GripVertical className="w-4 h-4 text-muted-foreground" />
          </button>
          <Badge className="bg-primary">Load #{load.load_order}</Badge>
          {load.using_contracted_rate && (
            <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">
              Contracted Rate Applied
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => duplicateLoad(index)}
            className="text-primary hover:text-primary/90"
            data-testid={`button-duplicate-load-${index}`}
            title="Duplicate this load"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => removeLoad(index)}
            className="text-destructive hover:text-destructive/90"
            data-testid={`button-remove-load-${index}`}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <div>
          <Label className="text-xs">Customer</Label>
          <Select 
            value={load.customer_id || 'na'} 
            onValueChange={(value) => updateLoad(index, 'customer_id', value === 'na' ? undefined : value)}
          >
            <SelectTrigger className="h-9" data-testid={`select-customer-${index}`}>
              <SelectValue placeholder="Select customer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="na">N/A</SelectItem>
              {customers.sort((a, b) => a.customer_name.localeCompare(b.customer_name)).map(customer => (
                <SelectItem key={customer.customer_id} value={customer.customer_id}>
                  {customer.customer_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">Pickup Location</Label>
          <Select 
            value={load.pickup_location_id} 
            onValueChange={(value) => updateLoad(index, 'pickup_location_id', value)}
          >
            <SelectTrigger className="h-9" data-testid={`select-pickup-${index}`}>
              <SelectValue placeholder="Select pickup" />
            </SelectTrigger>
            <SelectContent>
              {pickupLocations.map(loc => (
                <SelectItem key={loc.location_id} value={loc.location_id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-xs">Dropoff Location</Label>
          <Select 
            value={load.dropoff_location_id} 
            onValueChange={(value) => updateLoad(index, 'dropoff_location_id', value)}
          >
            <SelectTrigger className="h-9" data-testid={`select-dropoff-${index}`}>
              <SelectValue placeholder="Select dropoff" />
            </SelectTrigger>
            <SelectContent>
              {dropoffLocations.map(loc => (
                <SelectItem key={loc.location_id} value={loc.location_id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-xs">Product Type</Label>
          <Select 
            value={load.product_type} 
            onValueChange={(value: 'crude' | 'diesel') => updateLoad(index, 'product_type', value)}
          >
            <SelectTrigger className="h-9" data-testid={`select-product-${index}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crude">Crude Oil</SelectItem>
              <SelectItem value="diesel">Diesel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        <div>
          <Label className="text-xs">Volume ({load.product_type === 'crude' ? 'barrels' : 'gallons'})</Label>
          <Input
            type="number"
            className="h-9"
            value={load.volume}
            onChange={(e) => updateLoad(index, 'volume', parseFloat(e.target.value))}
            data-testid={`input-volume-${index}`}
          />
        </div>
        
        <div>
          <Label className="text-xs">
            Rate ($ per {load.product_type === 'crude' ? 'barrel' : 'gallon'})
            {load.using_contracted_rate && (
              <span className="text-primary text-[10px] font-normal ml-1">(Contract)</span>
            )}
          </Label>
          <Input
            type="number"
            step="0.01"
            className={`h-9 ${load.using_contracted_rate ? 'border-primary/50 bg-primary/5' : ''}`}
            value={load.rate_per_unit}
            onChange={(e) => updateLoad(index, 'rate_per_unit', parseFloat(e.target.value))}
            data-testid={`input-rate-${index}`}
          />
        </div>
      </div>
    </div>
  );
}

export default function ShiftBuilder() {
  const { toast } = useToast();
  const [loads, setLoads] = useState<LoadRoute[]>([]);
  const [baseYardId, setBaseYardId] = useState<string>("");
  const [shiftDate, setShiftDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [shiftName, setShiftName] = useState<string>("");
  const [targetRate, setTargetRate] = useState<number>(140); // Will be overridden by config
  const [travelSpeed, setTravelSpeed] = useState<number>(41); // Will be overridden by config
  const [trafficBufferMin, setTrafficBufferMin] = useState<number>(0); // Will be overridden by config
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [calculationResults, setCalculationResults] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const { data: contractedRoutes = [] } = useQuery<ContractedRoute[]>({
    queryKey: ['/api/contracted-routes'],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: config } = useQuery<Config>({
    queryKey: ['/api/config'],
  });

  // Apply config defaults when loaded
  useEffect(() => {
    if (config) {
      setTargetRate(config.hourly_target_default_usd);
      setTravelSpeed(config.avg_mph_default);
      setTrafficBufferMin(config.traffic_buffer_min_default);
    }
  }, [config]);

  // Get base locations (yards) - only locations with role 'yard'
  const baseLocations = locations.filter(loc => loc.role === 'yard').sort((a, b) => a.name.localeCompare(b.name));
  const pickupLocations = locations.filter(loc => loc.role === 'pickup' || loc.role === 'both').sort((a, b) => a.name.localeCompare(b.name));
  const dropoffLocations = locations.filter(loc => loc.role === 'dropoff' || loc.role === 'both').sort((a, b) => a.name.localeCompare(b.name));

  // Add a new load
  const addLoad = () => {
    if (loads.length >= 5) {
      toast({
        title: "Maximum loads reached",
        description: "You can have a maximum of 5 loads per shift",
        variant: "destructive",
      });
      return;
    }

    const newLoad: LoadRoute = {
      load_order: loads.length + 1,
      customer_id: undefined, // No customer selected initially
      pickup_location_id: "",
      dropoff_location_id: "",
      product_type: 'crude',
      volume: 155,
      rate_per_unit: 3.5,
      rate_type: 'per_barrel',
      pickup_time_min: config?.pickup_time_min_default || 60,
      dropoff_time_min: config?.dropoff_time_min_default || 60,
    };
    
    setLoads([...loads, newLoad]);
  };

  // Remove a load
  const removeLoad = (index: number) => {
    const updatedLoads = loads.filter((_, i) => i !== index).map((load, i) => ({
      ...load,
      load_order: i + 1
    }));
    setLoads(updatedLoads);
    // Reset segments when loads change
    setRouteSegments([]);
    setCalculationResults(null);
  };

  // Duplicate a load
  const duplicateLoad = (index: number) => {
    if (loads.length >= 5) {
      toast({
        title: "Maximum loads reached",
        description: "You can have a maximum of 5 loads per shift",
        variant: "destructive",
      });
      return;
    }

    const loadToDuplicate = loads[index];
    const newLoad: LoadRoute = {
      ...loadToDuplicate,
      load_order: loads.length + 1,
    };
    
    setLoads([...loads, newLoad]);
    // Reset segments when loads change
    setRouteSegments([]);
    setCalculationResults(null);
    
    toast({
      title: "Load duplicated",
      description: `Load #${index + 1} has been duplicated`,
    });
  };

  // Sensors for drag and drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag end
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = loads.findIndex((load, i) => i === Number(active.id));
      const newIndex = loads.findIndex((load, i) => i === Number(over.id));

      const reorderedLoads = arrayMove(loads, oldIndex, newIndex).map((load, i) => ({
        ...load,
        load_order: i + 1
      }));
      
      setLoads(reorderedLoads);
      // Reset segments when loads are reordered
      setRouteSegments([]);
      setCalculationResults(null);
      
      toast({
        title: "Loads reordered",
        description: "Shift route has been updated",
      });
    }
  };

  // Find matching contracted route for a specific customer
  const findContractedRoute = (pickup_id: string, dropoff_id: string, product_type: 'crude' | 'diesel', customer_id?: string) => {
    // If customer_id is provided, look for their specific contracted route
    if (customer_id) {
      return contractedRoutes.find(route => 
        route.customer_id === customer_id &&
        route.pickup_location_id === pickup_id &&
        route.dropoff_location_id === dropoff_id &&
        (route.product_type === product_type || route.product_type === 'both')
      );
    }
    // Otherwise, look for routes without a customer (general routes)
    return contractedRoutes.find(route => 
      !route.customer_id &&
      route.pickup_location_id === pickup_id &&
      route.dropoff_location_id === dropoff_id &&
      (route.product_type === product_type || route.product_type === 'both')
    );
  };

  // Update a load
  const updateLoad = (index: number, field: keyof LoadRoute, value: any) => {
    const updatedLoads = [...loads];
    const currentLoad = updatedLoads[index];
    
    // Update the field
    updatedLoads[index] = { ...currentLoad, [field]: value };
    
    // Check if we should apply contracted rate when customer, locations, or product type changes
    if (field === 'customer_id' || field === 'pickup_location_id' || field === 'dropoff_location_id' || field === 'product_type') {
      const load = updatedLoads[index];
      if (load.pickup_location_id && load.dropoff_location_id) {
        const contractedRoute = findContractedRoute(
          load.pickup_location_id,
          load.dropoff_location_id,
          load.product_type,
          load.customer_id
        );
        
        if (contractedRoute) {
          // Apply contracted rate but mark it so user knows
          updatedLoads[index] = {
            ...updatedLoads[index],
            rate_per_unit: contractedRoute.rate_per_unit,
            rate_type: contractedRoute.rate_type,
            volume: contractedRoute.avg_volume ?? load.volume,
            pickup_time_min: contractedRoute.avg_pickup_time ?? load.pickup_time_min,
            dropoff_time_min: contractedRoute.avg_dropoff_time ?? load.dropoff_time_min,
            using_contracted_rate: true,
            contracted_route_id: contractedRoute.route_id
          };
        } else {
          // Remove contracted rate flag if route changed
          updatedLoads[index].using_contracted_rate = false;
          updatedLoads[index].contracted_route_id = undefined;
        }
      }
    }
    
    // If user manually changes rate, mark as overridden
    if (field === 'rate_per_unit' && currentLoad.using_contracted_rate) {
      updatedLoads[index].using_contracted_rate = false;
    }
    
    setLoads(updatedLoads);
    // Reset segments when loads change
    setRouteSegments([]);
    setCalculationResults(null);
  };

  // Generate route segments based on loads and base yard
  const generateRouteSegments = async () => {
    if (!baseYardId) {
      toast({
        title: "Base yard required",
        description: "Please select a base yard first",
        variant: "destructive",
      });
      return;
    }

    if (loads.length === 0) {
      toast({
        title: "No loads added",
        description: "Please add at least one load",
        variant: "destructive",
      });
      return;
    }

    // Validate all loads have locations
    for (let i = 0; i < loads.length; i++) {
      if (!loads[i].pickup_location_id || !loads[i].dropoff_location_id) {
        toast({
          title: "Incomplete load information",
          description: `Load ${i + 1} is missing pickup or dropoff location`,
          variant: "destructive",
        });
        return;
      }
    }

    setIsCalculating(true);
    const segments: RouteSegment[] = [];

    try {
      // Generate all segments
      for (let i = 0; i < loads.length; i++) {
        const load = loads[i];
        
        if (i === 0) {
          // Base to first pickup
          segments.push({
            segment_type: 'base_to_pickup',
            from_location_id: baseYardId,
            to_location_id: load.pickup_location_id,
            load_index: i,
          });
        } else {
          // Previous dropoff to current pickup
          segments.push({
            segment_type: 'dropoff_to_pickup',
            from_location_id: loads[i - 1].dropoff_location_id,
            to_location_id: load.pickup_location_id,
            load_index: i,
          });
        }
        
        // Pickup to dropoff
        segments.push({
          segment_type: 'pickup_to_dropoff',
          from_location_id: load.pickup_location_id,
          to_location_id: load.dropoff_location_id,
          load_index: i,
        });
      }
      
      // Last dropoff to base
      segments.push({
        segment_type: 'dropoff_to_base',
        from_location_id: loads[loads.length - 1].dropoff_location_id,
        to_location_id: baseYardId,
        load_index: loads.length - 1,
      });

      // Fetch routes for each segment
      for (const segment of segments) {
        // Get location coordinates
        const fromLocation = locations.find(l => l.location_id === segment.from_location_id);
        const toLocation = locations.find(l => l.location_id === segment.to_location_id);
        
        if (!fromLocation || !toLocation) {
          throw new Error(`Could not find location coordinates for segment`);
        }
        
        const response = await fetch('/api/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            origin: {
              lat: fromLocation.lat,
              lon: fromLocation.lon,
            },
            destination: {
              lat: toLocation.lat,
              lon: toLocation.lon,
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch routes for segment`);
        }

        const data = await response.json();
        segment.available_routes = data.routes || [];
        // Auto-select first route
        if (segment.available_routes && segment.available_routes.length > 0) {
          segment.selected_route = segment.available_routes[0];
        }
      }

      setRouteSegments(segments);
      toast({
        title: "Routes generated",
        description: `Generated ${segments.length} route segments for your shift`,
      });
    } catch (error: any) {
      toast({
        title: "Error generating routes",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Select a route for a segment
  const selectRoute = (segmentIndex: number, route: any) => {
    const updatedSegments = [...routeSegments];
    updatedSegments[segmentIndex].selected_route = route;
    setRouteSegments(updatedSegments);
  };

  // Calculate complete shift
  const calculateShift = async () => {
    if (routeSegments.length === 0) {
      toast({
        title: "No routes generated",
        description: "Please generate routes first",
        variant: "destructive",
      });
      return;
    }

    // Check all segments have selected routes
    for (const segment of routeSegments) {
      if (!segment.selected_route) {
        toast({
          title: "Incomplete route selection",
          description: "Please select routes for all segments",
          variant: "destructive",
        });
        return;
      }
    }

    setIsCalculating(true);
    try {
      // Build calculation request
      const shiftLoads = loads.map((load, index) => {
        // Find the pickup-to-dropoff segment for this load
        const loadSegment = routeSegments.find(
          s => s.segment_type === 'pickup_to_dropoff' && s.load_index === index
        );
        
        return {
          load_order: load.load_order,
          pickup_location_id: load.pickup_location_id,
          dropoff_location_id: load.dropoff_location_id,
          product_type: load.product_type,
          volume: load.volume,
          rate_per_unit: load.rate_per_unit,
          rate_type: load.rate_type,
          pickup_time_min: load.pickup_time_min,
          dropoff_time_min: load.dropoff_time_min,
          distance_miles: loadSegment?.selected_route?.distance_miles || loadSegment?.selected_route?.miles || 0,
          drive_hours: (loadSegment?.selected_route?.distance_miles || loadSegment?.selected_route?.miles || 0) / travelSpeed,
          avg_speed: travelSpeed,
        };
      });

      const response = await fetch('/api/shifts/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loads: shiftLoads,
          include_deadhead: true,
          deadhead_type: 'portaltoportal',
          base_yard_id: baseYardId,
          traffic_buffer_min: trafficBufferMin,
          avg_mph: travelSpeed, // Send user-configured travel speed
          target_hourly_rate: targetRate, // Send target earnings rate
          route_segments: routeSegments.map(s => ({
            segment_type: s.segment_type,
            from_location_id: s.from_location_id,
            to_location_id: s.to_location_id,
            distance_miles: s.selected_route?.distance_miles || s.selected_route?.miles || 0,
            duration_hours: (s.selected_route?.distance_miles || s.selected_route?.miles || 0) / travelSpeed,
            polyline: s.selected_route?.polyline,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to calculate shift');
      }

      const results = await response.json();
      setCalculationResults(results);
      
      toast({
        title: "Shift calculated",
        description: `Total revenue: $${results.total_revenue?.toFixed(2)}, Effective rate: $${results.effective_hourly_rate?.toFixed(2)}/hr`,
      });
    } catch (error: any) {
      toast({
        title: "Calculation error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  // Save the shift
  const saveShift = async () => {
    if (!calculationResults) {
      toast({
        title: "No calculation results",
        description: "Please calculate the shift first",
        variant: "destructive",
      });
      return;
    }

    if (!shiftName) {
      toast({
        title: "Shift name required",
        description: "Please enter a name for the shift",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      // Prepare segment details with location names
      const segmentDetails = routeSegments.map(segment => {
        const fromLocation = locations.find(l => l.location_id === segment.from_location_id);
        const toLocation = locations.find(l => l.location_id === segment.to_location_id);
        
        return {
          segment_type: segment.segment_type,
          from_location_id: segment.from_location_id,
          to_location_id: segment.to_location_id,
          from_location_name: fromLocation?.name || '',
          to_location_name: toLocation?.name || '',
          distance_miles: segment.selected_route?.distance_miles || segment.selected_route?.miles || 0,
          duration_hours: segment.selected_route?.duration_hours || ((segment.selected_route?.distance_miles || segment.selected_route?.miles || 0) / travelSpeed),
          load_index: segment.load_index,
          selected_route: segment.selected_route,
        };
      });

      // Create shift with all configuration and segment details
      const shiftData: InsertShift = {
        name: shiftName,
        shift_date: shiftDate,
        status: 'planned',
        start_yard_id: baseYardId,
        end_yard_id: baseYardId,
        target_hourly_rate_usd: targetRate,
        travel_speed_mph: travelSpeed,
        traffic_buffer_min: trafficBufferMin,
        segment_details: segmentDetails,
        notes: `Created with Shift Builder - ${loads.length} loads`,
      };

      const shiftResponse = await apiRequest('POST', '/api/shifts', shiftData);
      const shiftJson = await shiftResponse.json();
      const shift_id = shiftJson.shift_id;

      // Update shift with calculated values
      await apiRequest('PUT', `/api/shifts/${shift_id}`, {
        total_revenue: calculationResults.total_revenue,
        total_miles: calculationResults.total_miles,
        total_work_time_hours: calculationResults.total_work_time_hours,
        total_drive_time_hours: calculationResults.total_drive_time_hours,
        effective_hourly_rate: calculationResults.effective_hourly_rate,
        deadhead_start_miles: calculationResults.deadhead_start_miles,
        deadhead_return_miles: calculationResults.deadhead_return_miles,
      });

      // Save shift loads with route information
      for (let i = 0; i < loads.length; i++) {
        const load = loads[i];
        const loadSegment = routeSegments.find(
          s => s.segment_type === 'pickup_to_dropoff' && s.load_index === i
        );
        
        const pickupLocation = locations.find(l => l.location_id === load.pickup_location_id);
        const dropoffLocation = locations.find(l => l.location_id === load.dropoff_location_id);

        await apiRequest('POST', `/api/shifts/${shift_id}/loads`, {
          shift_id,
          load_order: load.load_order,
          customer_id: load.customer_id,
          pickup_location_id: load.pickup_location_id,
          dropoff_location_id: load.dropoff_location_id,
          pickup_location_name: pickupLocation?.name,
          dropoff_location_name: dropoffLocation?.name,
          product_type: load.product_type,
          volume: load.volume,
          rate_per_unit: load.rate_per_unit,
          rate_type: load.rate_type,
          pickup_time_min: load.pickup_time_min,
          dropoff_time_min: load.dropoff_time_min,
          distance_miles: loadSegment?.selected_route?.distance_miles || 0,
          drive_hours: loadSegment?.selected_route?.duration_hours || 0,
          avg_speed: travelSpeed,
        });
      }

      toast({
        title: "Shift saved successfully",
        description: `Shift "${shiftName}" has been saved for later analysis`,
      });

      // Reset form
      setLoads([]);
      setRouteSegments([]);
      setCalculationResults(null);
      setShiftName("");
    } catch (error: any) {
      toast({
        title: "Error saving shift",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getSegmentLabel = (segment: RouteSegment) => {
    const fromLocation = locations.find(l => l.location_id === segment.from_location_id);
    const toLocation = locations.find(l => l.location_id === segment.to_location_id);
    
    let prefix = "";
    if (segment.segment_type === 'base_to_pickup') {
      prefix = "🏠 Base → 🔵 Pickup 1";
    } else if (segment.segment_type === 'pickup_to_dropoff') {
      prefix = `🔵 Load ${(segment.load_index || 0) + 1}`;
    } else if (segment.segment_type === 'dropoff_to_pickup') {
      prefix = `🔴 Drop ${segment.load_index} → 🔵 Pickup ${(segment.load_index || 0) + 1}`;
    } else if (segment.segment_type === 'dropoff_to_base') {
      prefix = "🔴 Last Drop → 🏠 Base";
    }
    
    return {
      prefix,
      from: fromLocation?.name || segment.from_location_id,
      to: toLocation?.name || segment.to_location_id,
    };
  };

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="mb-6 flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-card-foreground">Shift Builder</h1>
          <p className="text-muted-foreground">Build multi-load shifts with route selection for each segment</p>
        </div>
        <Link href="/shift-history">
          <Button variant="outline" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            View Shift History
          </Button>
        </Link>
      </div>

      {/* Shift Configuration */}
      <Card className="card-metallic">
        <CardHeader>
          <CardTitle>Shift Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Shift Name</Label>
                <Input
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="Morning Route"
                  data-testid="input-shift-name"
                />
              </div>
              <div>
                <Label>Shift Date</Label>
                <Input
                  type="date"
                  value={shiftDate}
                  onChange={(e) => setShiftDate(e.target.value)}
                  data-testid="input-shift-date"
                />
              </div>
              <div>
                <Label>Base Yard</Label>
                <Select value={baseYardId} onValueChange={setBaseYardId}>
                  <SelectTrigger data-testid="select-base-yard">
                    <SelectValue placeholder="Select base yard" />
                  </SelectTrigger>
                  <SelectContent>
                    {baseLocations.map(loc => (
                      <SelectItem key={loc.location_id} value={loc.location_id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Target Rate ($/hr)</Label>
                <Input
                  type="number"
                  value={targetRate}
                  onChange={(e) => setTargetRate(parseFloat(e.target.value))}
                  data-testid="input-target-rate"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Travel Speed (mph)</Label>
                <Input
                  type="number"
                  value={travelSpeed}
                  onChange={(e) => setTravelSpeed(parseFloat(e.target.value) || 41)}
                  placeholder="41"
                  data-testid="input-travel-speed"
                />
              </div>
              <div className="col-span-3 flex items-end">
                <p className="text-sm text-muted-foreground">
                  This speed will be used to calculate drive time for all route segments
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Traffic Buffer (min)</Label>
                <Input
                  type="number"
                  value={trafficBufferMin}
                  onChange={(e) => setTrafficBufferMin(parseInt(e.target.value) || 0)}
                  placeholder="20"
                  data-testid="input-traffic-buffer"
                />
              </div>
              <div className="col-span-3 flex items-end">
                <p className="text-sm text-muted-foreground">
                  Additional time buffer to account for traffic and unexpected delays
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loads Management */}
      <Card className="card-metallic">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Shift Loads ({loads.length}/5)</CardTitle>
          <Button 
            onClick={addLoad} 
            disabled={loads.length >= 5}
            className="bg-primary hover:bg-primary/90"
            data-testid="button-add-load"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Load
          </Button>
        </CardHeader>
        <CardContent>
          {loads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No loads added yet. Click "Add Load" to start building your shift.
            </div>
          ) : (
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={loads.map((_, index) => index)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-4">
                  {loads.map((load, index) => (
                    <SortableLoadItem
                      key={index}
                      load={load}
                      index={index}
                      customers={customers}
                      pickupLocations={pickupLocations}
                      dropoffLocations={dropoffLocations}
                      updateLoad={updateLoad}
                      duplicateLoad={duplicateLoad}
                      removeLoad={removeLoad}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
          
          {loads.length > 0 && (
            <div className="mt-6 flex justify-end">
              <Button 
                onClick={generateRouteSegments}
                disabled={isCalculating}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                data-testid="button-generate-routes"
              >
                <Route className="w-4 h-4 mr-2" />
                {isCalculating ? "Generating Routes..." : "Generate Routes"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Route Selection */}
      {routeSegments.length > 0 && (
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle>Route Selection</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {routeSegments.map((segment, index) => {
              const label = getSegmentLabel(segment);
              return (
                <div key={index} className="card-metallic p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="text-sm font-semibold text-primary">{label.prefix}</div>
                      <div className="text-xs text-muted-foreground">
                        {label.from} → {label.to}
                      </div>
                    </div>
                    {segment.available_routes && segment.available_routes.length > 0 && (
                      <SegmentRouteMap
                        segmentName={label.prefix}
                        routes={segment.available_routes.map((r: any, idx: number) => ({
                          id: r.id || r.route_id || `route_${idx}`,
                          summary: r.summary || `Route ${idx + 1}`,
                          distance_miles: r.distance_miles || r.miles || 0,
                          duration_hours: (r.distance_miles || r.miles || 0) / travelSpeed,
                          polyline: r.polyline || '',
                        }))}
                        selectedRoute={segment.selected_route?.id || segment.selected_route?.route_id || null}
                        onSelectRoute={(routeId) => {
                          const route = segment.available_routes?.find((r: any) => (r.id === routeId || r.route_id === routeId));
                          if (route) selectRoute(index, route);
                        }}
                        fromLocation={{
                          name: label.from,
                          lat: locations.find(l => l.location_id === segment.from_location_id)?.lat || 0,
                          lon: locations.find(l => l.location_id === segment.from_location_id)?.lon || 0,
                        }}
                        toLocation={{
                          name: label.to,
                          lat: locations.find(l => l.location_id === segment.to_location_id)?.lat || 0,
                          lon: locations.find(l => l.location_id === segment.to_location_id)?.lon || 0,
                        }}
                      />
                    )}
                  </div>
                  
                  {segment.available_routes && segment.available_routes.length > 0 ? (
                    <RadioGroup 
                      value={segment.selected_route?.id || segment.selected_route?.route_id || ""} 
                      onValueChange={(value) => {
                        const route = segment.available_routes?.find((r: any) => r.id === value || r.route_id === value);
                        if (route) selectRoute(index, route);
                      }}
                    >
                      {segment.available_routes.map((route: any, routeIndex: number) => {
                        const routeId = route.id || route.route_id || `route_${routeIndex}`;
                        const miles = route.distance_miles || route.miles || 0;
                        const driveHours = miles / travelSpeed; // Calculate drive time based on configured speed
                        const driveMinutes = Math.round(driveHours * 60);
                        
                        return (
                          <div key={routeId} className="flex items-center space-x-2 p-2 hover:bg-muted/50 rounded">
                            <RadioGroupItem value={routeId} id={`route-${index}-${routeIndex}`} />
                            <Label htmlFor={`route-${index}-${routeIndex}`} className="flex-1 cursor-pointer">
                              <div className="flex justify-between items-center">
                                <span className="text-sm">{route.summary || `Route ${routeIndex + 1}`}</span>
                                <div className="flex gap-4 text-xs text-muted-foreground">
                                  <span>{miles.toFixed(1)} mi</span>
                                  <span>{Math.floor(driveHours)}h {driveMinutes % 60}m @ {travelSpeed} mph</span>
                                </div>
                              </div>
                            </Label>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  ) : (
                    <div className="text-sm text-muted-foreground">No routes available</div>
                  )}
                </div>
              );
            })}
            
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                onClick={calculateShift}
                disabled={isCalculating}
                className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
                data-testid="button-calculate-shift"
              >
                <Calculator className="w-4 h-4 mr-2" />
                {isCalculating ? "Calculating..." : "Calculate Shift"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {calculationResults && (
        <Card className="card-metallic">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Shift Analysis</CardTitle>
            <Button 
              onClick={saveShift}
              disabled={isSaving}
              className="bg-primary hover:bg-primary/90"
              data-testid="button-save-shift"
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? "Saving..." : "Save Shift"}
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Revenue</div>
                <div className="text-xl font-bold text-primary">
                  ${calculationResults.total_revenue?.toFixed(2) || '0.00'}
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Miles</div>
                <div className="text-xl font-bold text-card-foreground">
                  {calculationResults.total_miles?.toFixed(1) || '0.0'} mi
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-3">Time Breakdown</div>
                
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Drive Time:</span>
                    <span className="font-medium">{calculationResults.total_drive_time_hours?.toFixed(2) || '0.00'} hrs</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Load/Offload Time:</span>
                    <span className="font-medium">{calculationResults.total_load_offload_hours?.toFixed(2) || '0.00'} hrs</span>
                  </div>
                  
                  {calculationResults.traffic_buffer_hours > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Traffic Buffer:</span>
                      <span className="font-medium">{calculationResults.traffic_buffer_hours?.toFixed(2) || '0.00'} hrs</span>
                    </div>
                  )}
                  
                  <div className="border-t border-border my-2"></div>
                  
                  <div className="flex justify-between">
                    <span className="font-semibold">Total Work Time:</span>
                    <span className="font-bold text-primary text-lg">
                      {calculationResults.total_work_time_hours?.toFixed(2) || '0.00'} hrs
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Effective Rate</div>
                <div className={`text-xl font-bold ${
                  calculationResults.effective_hourly_rate >= targetRate ? 'text-primary' : 'text-destructive'
                }`}>
                  ${calculationResults.effective_hourly_rate?.toFixed(2) || '0.00'}/hr
                </div>
                <div className="text-xs mt-1">
                  <span className="text-muted-foreground">Target: ${targetRate}/hr</span>
                  <span className={`ml-2 font-semibold ${
                    calculationResults.effective_hourly_rate >= targetRate ? 'text-primary' : 'text-destructive'
                  }`}>
                    {calculationResults.effective_hourly_rate >= targetRate ? '✓' : 
                     `${((calculationResults.effective_hourly_rate / targetRate - 1) * 100).toFixed(0)}%`}
                  </span>
                </div>
              </div>

              {/* Rate to Meet Target */}
              {calculationResults.target_analysis?.required_rate_per_unit && 
               calculationResults.effective_hourly_rate < targetRate && (
                <div className="card-metallic p-4">
                  <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Rate to Meet Target</div>
                  <div className="text-xl font-bold text-green-600 dark:text-green-500">
                    ${calculationResults.target_analysis.required_rate_per_unit.toFixed(2)}
                  </div>
                  <div className="text-xs mt-1">
                    <span className="text-muted-foreground">
                      per {calculationResults.load_calculations?.[0]?.product_type === 'crude' ? 'barrel' : 'gallon'}
                    </span>
                    <span className="ml-2 font-semibold text-green-600 dark:text-green-500">
                      +${(calculationResults.target_analysis.rate_increase_needed || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Target Rate Analysis */}
            {calculationResults.effective_hourly_rate < targetRate && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-destructive mb-1">Below Target Earnings</h4>
                    <p className="text-sm text-muted-foreground mb-2">
                      This shift is ${((targetRate - calculationResults.effective_hourly_rate) * calculationResults.total_work_time_hours).toFixed(2)} short of your ${targetRate}/hr target.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      To meet your target, you would need to:
                    </p>
                    <ul className="text-sm text-muted-foreground mt-1 ml-4 list-disc">
                      <li>Increase total revenue to ${(targetRate * calculationResults.total_work_time_hours).toFixed(2)}</li>
                      <li>Or reduce work time to {(calculationResults.total_revenue / targetRate).toFixed(1)} hours</li>
                      <li>Or increase rates by {((targetRate / calculationResults.effective_hourly_rate - 1) * 100).toFixed(0)}%</li>
                      {calculationResults.target_analysis?.required_rate_per_unit && (
                        <li className="text-yellow-600 dark:text-yellow-500 font-medium">
                          Or change your rate to ${calculationResults.target_analysis.required_rate_per_unit.toFixed(2)} per barrel
                          {' '}(currently ${calculationResults.target_analysis.current_avg_rate_per_unit.toFixed(2)})
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {calculationResults.effective_hourly_rate >= targetRate && (
              <div className="mb-6 p-4 bg-primary/10 border border-primary/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-5 h-5 text-primary mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-primary mb-1">Target Achieved!</h4>
                    <p className="text-sm text-muted-foreground">
                      This shift exceeds your ${targetRate}/hr target by ${((calculationResults.effective_hourly_rate - targetRate) * calculationResults.total_work_time_hours).toFixed(2)} 
                      ({((calculationResults.effective_hourly_rate / targetRate - 1) * 100).toFixed(0)}% above target).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Detailed breakdown if available */}
            {calculationResults.route_segments && (
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-card-foreground">Route Breakdown</h4>
                {calculationResults.route_segments.map((segment: any, index: number) => (
                  <div key={index} className="flex justify-between text-sm p-2 bg-muted/30 rounded">
                    <span className="text-muted-foreground">{segment.segment_type.replace(/_/g, ' ')}</span>
                    <div className="flex gap-4">
                      <span>{segment.distance_miles.toFixed(1)} mi</span>
                      <span>{(segment.duration_hours * 60).toFixed(0)} min</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}