import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Route, Clock, ArrowLeftRight, Calculator, Users, AlertTriangle, MapPinOff, Download, Search } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Location, Config } from "@shared/schema";

interface Props {
  onCalculate: (data: any) => void;
  onBatchCalculate?: (data: any) => void;
}

export default function CalculatorInputs({ onCalculate, onBatchCalculate }: Props) {
  const { toast } = useToast();
  const [location] = useLocation();
  const [formData, setFormData] = useState({
    pickup_location_id: "",
    dropoff_location_id: "",
    load_type: "crude" as "crude" | "diesel",
    units_loaded: 155,
    avg_mph: 41, // Will be overridden by config
    pickup_time_min: 60, // Will be overridden by config
    dropoff_time_min: 60, // Will be overridden by config
    traffic_buffer_min: 0, // Will be overridden by config
    hourly_target_usd: 140, // Will be overridden by config
    include_deadhead: true, // Will be overridden by config
    deadhead_type: "portaltoportal" as "none" | "oneway" | "portaltoportal" | "roundtrip",
    assume_symmetric_route: true, // Will be overridden by config
    base_yard_id: "",
  });

  const [batchMode, setBatchMode] = useState(false);
  const [batchModeType, setBatchModeType] = useState<'collection' | 'distribution' | 'matrix'>('collection');
  const [selectedPickupIds, setSelectedPickupIds] = useState<string[]>([]);
  const [selectedDropoffIds, setSelectedDropoffIds] = useState<string[]>([]);
  const [overrideDefaultUnits, setOverrideDefaultUnits] = useState(false);
  const [overrideLocationDefaults, setOverrideLocationDefaults] = useState(false);
  const [pickupSearchQuery, setPickupSearchQuery] = useState("");
  const [dropoffSearchQuery, setDropoffSearchQuery] = useState("");

  // Load locations and config
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const { data: config } = useQuery<Config>({
    queryKey: ['/api/config'],
  });
  
  // Check if selected pickup location has default units for single mode
  const selectedPickupLocation = !batchMode && formData.pickup_location_id 
    ? locations.find(l => l.location_id === formData.pickup_location_id)
    : null;
  const singlePickupHasDefaults = selectedPickupLocation?.default_units_loaded !== null && 
    selectedPickupLocation?.default_units_loaded !== undefined;
  
  // Check if selected locations have default units for batch mode
  const selectedLocationsHaveDefaults = batchMode && selectedPickupIds.some(id => {
    const location = locations.find(l => l.location_id === id);
    return location?.default_units_loaded !== null && location?.default_units_loaded !== undefined;
  });

  // Load scenario from URL parameters
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const hasParams = searchParams.has('pickup') || searchParams.has('dropoff');
    
    if (hasParams) {
      setFormData(prev => ({
        ...prev,
        pickup_location_id: searchParams.get('pickup') || prev.pickup_location_id,
        dropoff_location_id: searchParams.get('dropoff') || prev.dropoff_location_id,
        load_type: (searchParams.get('load_type') as 'crude' | 'diesel') || prev.load_type,
        units_loaded: parseInt(searchParams.get('units_loaded') || '') || prev.units_loaded,
        avg_mph: parseInt(searchParams.get('avg_mph') || '') || prev.avg_mph,
        pickup_time_min: parseInt(searchParams.get('pickup_time_min') || '') || prev.pickup_time_min,
        dropoff_time_min: parseInt(searchParams.get('dropoff_time_min') || '') || prev.dropoff_time_min,
        traffic_buffer_min: parseInt(searchParams.get('traffic_buffer_min') || '') || prev.traffic_buffer_min,
        hourly_target_usd: parseInt(searchParams.get('hourly_target_usd') || '') || prev.hourly_target_usd,
        include_deadhead: searchParams.get('include_deadhead') === 'true',
        deadhead_type: (searchParams.get('deadhead_type') as 'none' | 'oneway' | 'portaltoportal' | 'roundtrip') || prev.deadhead_type,
        assume_symmetric_route: searchParams.get('assume_symmetric_route') === 'true',
      }));
    }
  }, []);

  // Update form with config defaults
  useEffect(() => {
    if (config) {
      // Only update config defaults if URL params haven't been loaded
      const searchParams = new URLSearchParams(window.location.search);
      const hasParams = searchParams.has('pickup') || searchParams.has('dropoff');
      
      if (!hasParams) {
        setFormData(prev => ({
          ...prev,
          avg_mph: config.avg_mph_default,
          hourly_target_usd: config.hourly_target_default_usd,
          traffic_buffer_min: config.traffic_buffer_min_default,
          pickup_time_min: config.pickup_time_min_default || 45,
          dropoff_time_min: config.dropoff_time_min_default || 60,
          include_deadhead: config.include_deadhead_default,
          assume_symmetric_route: config.assume_symmetric_route_for_empty,
        }));
      }
    }
  }, [config]);

  // Reset overrides when batch mode, mode type, or selected locations change
  useEffect(() => {
    setOverrideDefaultUnits(false);
    setOverrideLocationDefaults(false);
  }, [batchMode, batchModeType, selectedPickupIds.length, selectedDropoffIds.length]);
  
  // Update units when pickup location changes in single mode and not overriding
  useEffect(() => {
    if (!batchMode && selectedPickupLocation && singlePickupHasDefaults && !overrideDefaultUnits) {
      setFormData(prev => ({
        ...prev,
        units_loaded: selectedPickupLocation.default_units_loaded || prev.units_loaded
      }));
    }
  }, [formData.pickup_location_id, overrideDefaultUnits, batchMode]);

  // Update location-specific defaults (avg_speed, pickup/dropoff times) when location changes
  useEffect(() => {
    if (!batchMode && !overrideLocationDefaults) {
      let updates: any = {};
      
      // Use pickup location's avg_speed if available
      if (selectedPickupLocation?.avg_speed) {
        updates.avg_mph = selectedPickupLocation.avg_speed;
      }
      
      // Use pickup location's default pickup time if available
      if (selectedPickupLocation?.default_pickup_min !== null && selectedPickupLocation?.default_pickup_min !== undefined) {
        updates.pickup_time_min = selectedPickupLocation.default_pickup_min;
      }
      
      // Use dropoff location's default dropoff time if available
      const selectedDropoffLocation = formData.dropoff_location_id 
        ? locations.find(l => l.location_id === formData.dropoff_location_id)
        : null;
      if (selectedDropoffLocation?.default_dropoff_min !== null && selectedDropoffLocation?.default_dropoff_min !== undefined) {
        updates.dropoff_time_min = selectedDropoffLocation.default_dropoff_min;
      }
      
      // Apply updates if any
      if (Object.keys(updates).length > 0) {
        setFormData(prev => ({
          ...prev,
          ...updates
        }));
      }
    }
  }, [formData.pickup_location_id, formData.dropoff_location_id, overrideLocationDefaults, batchMode]);

  const calculateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/calculate', data),
    onSuccess: async (response, variables) => {
      const result = await response.json();
      // Attach the original request so downstream components (e.g. the map's
      // draggable-route recalculation) can re-run the rate engine.
      onCalculate({ ...result, request: variables });
      toast({
        title: "Calculation Complete",
        description: `Found ${result.calculations.length} route options.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Calculation Failed",
        description: error.message || "Failed to calculate routes",
        variant: "destructive",
      });
    },
  });

  const batchCalculateMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/calculate-batch', data),
    onSuccess: async (response, variables) => {
      const result = await response.json();
      // Attach the original request for draggable-route recalculation.
      onBatchCalculate?.({ ...result, request: variables });
      toast({
        title: "Batch Calculation Complete",
        description: `Calculated rates for ${result.results.length} pickup locations.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Batch Calculation Failed",
        description: error.message || "Failed to calculate batch routes",
        variant: "destructive",
      });
    },
  });

  const handleCalculate = () => {
    if (batchMode) {
      // Validate based on batch mode type
      if (batchModeType === 'collection') {
        if (selectedPickupIds.length === 0 || !formData.dropoff_location_id) {
          toast({
            title: "Missing Information",
            description: "Please select pickup locations and a dropoff location for collection mode.",
            variant: "destructive",
          });
          return;
        }
      } else if (batchModeType === 'distribution') {
        if (!formData.pickup_location_id || selectedDropoffIds.length === 0) {
          toast({
            title: "Missing Information",
            description: "Please select a pickup location and dropoff locations for distribution mode.",
            variant: "destructive",
          });
          return;
        }
      } else if (batchModeType === 'matrix') {
        if (selectedPickupIds.length === 0 || selectedDropoffIds.length === 0) {
          toast({
            title: "Missing Information",
            description: "Please select both pickup locations and dropoff locations for matrix mode.",
            variant: "destructive",
          });
          return;
        }
        // Warn about large matrix calculations
        const totalCalculations = selectedPickupIds.length * selectedDropoffIds.length;
        if (totalCalculations > 50) {
          const proceed = confirm(`This will calculate ${totalCalculations} route combinations. This may take a while. Continue?`);
          if (!proceed) return;
        }
      }

      // Prepare batch data based on mode
      let batchData;
      const commonBatchFields = {
        load_type: formData.load_type,
        units_loaded: overrideDefaultUnits ? formData.units_loaded : undefined,
        avg_mph: formData.avg_mph,
        pickup_time_min: overrideLocationDefaults ? formData.pickup_time_min : undefined,
        dropoff_time_min: overrideLocationDefaults ? formData.dropoff_time_min : undefined,
        traffic_buffer_min: formData.traffic_buffer_min,
        hourly_target_usd: formData.hourly_target_usd,
        include_deadhead: formData.deadhead_type !== "none",
        deadhead_type: formData.deadhead_type,
        assume_symmetric_route: formData.assume_symmetric_route,
        base_yard_id: formData.base_yard_id,
      };

      if (batchModeType === 'collection') {
        batchData = {
          batch_mode_type: 'collection',
          pickup_location_ids: selectedPickupIds,
          dropoff_location_id: formData.dropoff_location_id,
          ...commonBatchFields,
        };
      } else if (batchModeType === 'distribution') {
        batchData = {
          batch_mode_type: 'distribution',
          pickup_location_id: formData.pickup_location_id,
          dropoff_location_ids: selectedDropoffIds,
          ...commonBatchFields,
        };
      } else { // matrix mode
        batchData = {
          batch_mode_type: 'matrix',
          pickup_location_ids: selectedPickupIds,
          dropoff_location_ids: selectedDropoffIds,
          ...commonBatchFields,
        };
      }

      batchCalculateMutation.mutate(batchData);
    } else {
      if (!formData.pickup_location_id || !formData.dropoff_location_id) {
        toast({
          title: "Missing Information",
          description: "Please select both pickup and dropoff locations.",
          variant: "destructive",
        });
        return;
      }

      // Check for missing coordinates in single mode
      if (hasInvalidCoords) {
        let message = '';
        if (pickupMissingCoords) {
          message = `Pickup location '${selectedPickup?.name}' is missing GPS coordinates. `;
        }
        if (dropoffMissingCoords) {
          message += `Dropoff location '${selectedDropoff?.name}' is missing GPS coordinates. `;
        }
        message += 'Please add latitude and longitude in the Locations page before calculating routes.';
        
        toast({
          title: "Missing GPS Coordinates",
          description: message,
          variant: "destructive",
        });
        return;
      }

      // Use default units if not overriding and location has defaults
      const unitsToUse = !overrideDefaultUnits && singlePickupHasDefaults && selectedPickupLocation
        ? selectedPickupLocation.default_units_loaded
        : formData.units_loaded;
      
      const calculationData = {
        ...formData,
        units_loaded: unitsToUse,
        include_deadhead: formData.deadhead_type !== "none",
      };
      calculateMutation.mutate(calculationData);
    }
  };

  const handlePickupSelectionChange = (locationId: string, checked: boolean) => {
    setSelectedPickupIds(prev => 
      checked 
        ? [...prev, locationId]
        : prev.filter(id => id !== locationId)
    );
  };

  const pickupLocations = locations.filter(l => 
    l.role === 'pickup' || l.role === 'both'
  ).sort((a, b) => a.name.localeCompare(b.name));
  
  const dropoffLocations = locations.filter(l => 
    l.role === 'dropoff' || l.role === 'both'
  ).sort((a, b) => a.name.localeCompare(b.name));

  // Filter locations based on search queries
  const filteredPickupLocations = pickupLocations.filter(location =>
    location.name.toLowerCase().includes(pickupSearchQuery.toLowerCase())
  );
  
  const filteredDropoffLocations = dropoffLocations.filter(location =>
    location.name.toLowerCase().includes(dropoffSearchQuery.toLowerCase())
  );

  // Check if selected locations have missing coordinates
  const selectedPickup = locations.find(l => l.location_id === formData.pickup_location_id);
  const selectedDropoff = locations.find(l => l.location_id === formData.dropoff_location_id);
  const pickupMissingCoords = selectedPickup && (selectedPickup.lat === null || selectedPickup.lat === undefined || selectedPickup.lon === null || selectedPickup.lon === undefined);
  const dropoffMissingCoords = selectedDropoff && (selectedDropoff.lat === null || selectedDropoff.lat === undefined || selectedDropoff.lon === null || selectedDropoff.lon === undefined);
  const hasInvalidCoords = pickupMissingCoords || dropoffMissingCoords;

  // Check batch mode locations for missing coordinates
  const batchPickupsWithMissingCoords = selectedPickupIds.filter(id => {
    const location = locations.find(l => l.location_id === id);
    return location && (location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined);
  });
  const batchHasInvalidCoords = batchPickupsWithMissingCoords.length > 0 || dropoffMissingCoords;

  return (
    <div className="space-y-6">
      {/* Route Selection Card */}
      <Card className="card-metallic">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Route className="w-5 h-5 text-primary mr-2" />
            Route Selection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label htmlFor="pickup-select">
                {batchMode 
                  ? (batchModeType === 'distribution' ? 'Pickup Location' : 'Pickup Locations')
                  : 'Pickup Location'}
              </Label>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="batch-mode"
                  checked={batchMode}
                  onCheckedChange={(checked) => setBatchMode(!!checked)}
                  data-testid="checkbox-batch-mode"
                />
                <Label htmlFor="batch-mode" className="text-sm">Batch Mode</Label>
              </div>
            </div>
            
            {batchMode && (
              <div className="mb-3">
                <Label htmlFor="batch-mode-type" className="text-sm">Batch Mode Type</Label>
                <Select 
                  value={batchModeType} 
                  onValueChange={(value) => {
                    setBatchModeType(value as 'collection' | 'distribution' | 'matrix');
                    // Reset selections when changing mode
                    setSelectedPickupIds([]);
                    setSelectedDropoffIds([]);
                  }}
                >
                  <SelectTrigger id="batch-mode-type" className="w-full" data-testid="select-batch-mode-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="collection">Collection (Many → One)</SelectItem>
                    <SelectItem value="distribution">Distribution (One → Many)</SelectItem>
                    <SelectItem value="matrix">Matrix (Many → Many)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {batchModeType === 'collection' && "Multiple pickup locations to one dropoff location"}
                  {batchModeType === 'distribution' && "One pickup location to multiple dropoff locations"}
                  {batchModeType === 'matrix' && "All combinations of pickup and dropoff locations"}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                  onClick={() => {
                    // Generate and download CSV template based on mode
                    const headers = batchModeType === 'collection' 
                      ? ['pickup_location_id', 'pickup_name', 'pickup_lat', 'pickup_lon']
                      : batchModeType === 'distribution'
                      ? ['dropoff_location_id', 'dropoff_name', 'dropoff_lat', 'dropoff_lon']
                      : ['location_id', 'location_name', 'latitude', 'longitude', 'type'];
                    
                    const sampleData = batchModeType === 'collection'
                      ? [
                          ['BAKERSFIELD_WEST', 'Bakersfield West', '35.3733', '-119.0187'],
                          ['TAFT_YARD', 'Taft Yard', '35.1425', '-119.4565'],
                        ]
                      : batchModeType === 'distribution'
                      ? [
                          ['LONG_BEACH', 'Long Beach Terminal', '33.7701', '-118.1937'],
                          ['SACRAMENTO', 'Sacramento Depot', '38.5816', '-121.4944'],
                        ]
                      : [
                          ['BAKERSFIELD_WEST', 'Bakersfield West', '35.3733', '-119.0187', 'pickup'],
                          ['TAFT_YARD', 'Taft Yard', '35.1425', '-119.4565', 'pickup'],
                          ['LONG_BEACH', 'Long Beach Terminal', '33.7701', '-118.1937', 'dropoff'],
                          ['SACRAMENTO', 'Sacramento Depot', '38.5816', '-121.4944', 'dropoff'],
                        ];
                    
                    const csvContent = [
                      headers.join(','),
                      ...sampleData.map(row => row.join(','))
                    ].join('\n');
                    
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `batch_${batchModeType}_template.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                  data-testid="button-download-template"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Template
                </Button>
              </div>
            )}
            
            {batchMode ? (
              batchModeType === 'distribution' ? (
                // Distribution mode: Single pickup selection
                <SearchableSelect
                  value={formData.pickup_location_id}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, pickup_location_id: value }))}
                  options={pickupLocations.map(location => ({
                    value: location.location_id,
                    label: location.name + ((location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined) ? ' ⚠️' : ''),
                    disabled: false
                  }))}
                  placeholder="Select pickup location..."
                  emptyMessage="No locations found."
                  testId="select-pickup"
                />
              ) : (
                // Collection/Matrix mode: Multiple pickup selection
                <div className="space-y-2">
                  <div className="border rounded-md p-2">
                    <div className="relative mb-2">
                      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder="Search pickup locations..."
                        className="pl-8 h-8"
                        value={pickupSearchQuery}
                        onChange={(e) => setPickupSearchQuery(e.target.value)}
                        data-testid="input-search-pickups"
                      />
                    </div>
                    <div className="flex items-center space-x-2 py-1 border-b mb-2">
                      <Checkbox
                        id="select-all"
                        checked={filteredPickupLocations.length > 0 && filteredPickupLocations.every(l => selectedPickupIds.includes(l.location_id))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const newIds = Array.from(new Set([...selectedPickupIds, ...filteredPickupLocations.map(l => l.location_id)]));
                            setSelectedPickupIds(newIds);
                          } else {
                            const filteredIds = filteredPickupLocations.map(l => l.location_id);
                            setSelectedPickupIds(prev => prev.filter(id => !filteredIds.includes(id)));
                          }
                        }}
                        data-testid="checkbox-select-all"
                      />
                      <Label 
                        htmlFor="select-all" 
                        className="text-sm font-medium cursor-pointer flex-1"
                      >
                        Select All ({filteredPickupLocations.length})
                      </Label>
                    </div>
                    <div className="max-h-32 overflow-y-auto">
                      {filteredPickupLocations.map(location => (
                        <div key={location.location_id} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`pickup-${location.location_id}`}
                            checked={selectedPickupIds.includes(location.location_id)}
                            onCheckedChange={(checked) => 
                              handlePickupSelectionChange(location.location_id, !!checked)
                            }
                            data-testid={`checkbox-pickup-${location.location_id}`}
                          />
                          <Label 
                            htmlFor={`pickup-${location.location_id}`} 
                            className="text-sm cursor-pointer flex-1"
                          >
                            <div className="flex items-center gap-1">
                              {location.name}
                              {(location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined) && (
                                <span title="Missing GPS coordinates">
                                  <MapPinOff className="w-3 h-3 text-destructive" />
                                </span>
                              )}
                            </div>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedPickupIds.length > 0 && (
                    <Badge variant="secondary">
                      {selectedPickupIds.length} location{selectedPickupIds.length === 1 ? '' : 's'} selected
                    </Badge>
                  )}
                </div>
              )
            ) : (
              // Single mode: Searchable pickup selection
              <SearchableSelect
                value={formData.pickup_location_id}
                onValueChange={(value) => {
                  setFormData(prev => ({ ...prev, pickup_location_id: value }));
                  setOverrideDefaultUnits(false); // Reset override when changing pickup
                }}
                options={pickupLocations.map(location => ({
                  value: location.location_id,
                  label: location.name + ((location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined) ? ' ⚠️' : ''),
                  disabled: false
                }))}
                placeholder="Select pickup location..."
                emptyMessage="No locations found."
                testId="select-pickup-location"
              />
            )}
          </div>

          <div>
            <Label htmlFor="dropoff-select">
              {batchMode 
                ? (batchModeType === 'collection' ? 'Dropoff Location' : 'Dropoff Locations')
                : 'Dropoff Location'}
            </Label>
            {batchMode && (batchModeType === 'distribution' || batchModeType === 'matrix') ? (
              // Distribution/Matrix mode: Multiple dropoff selection
              <div className="space-y-2 mt-2">
                <div className="border rounded-md p-2">
                  <div className="relative mb-2">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder="Search dropoff locations..."
                      className="pl-8 h-8"
                      value={dropoffSearchQuery}
                      onChange={(e) => setDropoffSearchQuery(e.target.value)}
                      data-testid="input-search-dropoffs"
                    />
                  </div>
                  <div className="flex items-center space-x-2 py-1 border-b mb-2">
                    <Checkbox
                      id="select-all-dropoff"
                      checked={filteredDropoffLocations.length > 0 && filteredDropoffLocations.every(l => selectedDropoffIds.includes(l.location_id))}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const newIds = Array.from(new Set([...selectedDropoffIds, ...filteredDropoffLocations.map(l => l.location_id)]));
                          setSelectedDropoffIds(newIds);
                        } else {
                          const filteredIds = filteredDropoffLocations.map(l => l.location_id);
                          setSelectedDropoffIds(prev => prev.filter(id => !filteredIds.includes(id)));
                        }
                      }}
                      data-testid="checkbox-select-all-dropoff"
                    />
                    <Label 
                      htmlFor="select-all-dropoff" 
                      className="text-sm font-medium cursor-pointer flex-1"
                    >
                      Select All ({filteredDropoffLocations.length})
                    </Label>
                  </div>
                  <div className="max-h-32 overflow-y-auto">
                    {filteredDropoffLocations.map(location => (
                      <div key={location.location_id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`dropoff-${location.location_id}`}
                          checked={selectedDropoffIds.includes(location.location_id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedDropoffIds([...selectedDropoffIds, location.location_id]);
                            } else {
                              setSelectedDropoffIds(selectedDropoffIds.filter(id => id !== location.location_id));
                            }
                          }}
                          data-testid={`checkbox-dropoff-${location.location_id}`}
                        />
                        <Label 
                          htmlFor={`dropoff-${location.location_id}`} 
                          className="text-sm cursor-pointer flex-1"
                        >
                          <div className="flex items-center gap-1">
                            {location.name}
                            {(location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined) && (
                              <span title="Missing GPS coordinates">
                                <MapPinOff className="w-3 h-3 text-destructive" />
                              </span>
                            )}
                          </div>
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                {selectedDropoffIds.length > 0 && (
                  <Badge variant="secondary">
                    {selectedDropoffIds.length} location{selectedDropoffIds.length === 1 ? '' : 's'} selected
                  </Badge>
                )}
              </div>
            ) : (
              // Collection mode or single mode: Single dropoff selection
              <SearchableSelect
                value={formData.dropoff_location_id}
                onValueChange={(value) => setFormData(prev => ({ ...prev, dropoff_location_id: value }))}
                options={dropoffLocations.map(location => ({
                  value: location.location_id,
                  label: location.name + ((location.lat === null || location.lat === undefined || location.lon === null || location.lon === undefined) ? ' ⚠️' : ''),
                  disabled: false
                }))}
                placeholder="Select dropoff location..."
                emptyMessage="No locations found."
                testId="select-dropoff-location"
              />
            )}
          </div>

          <div>
            <Label>Load Type</Label>
            <RadioGroup 
              value={formData.load_type} 
              onValueChange={(value: "crude" | "diesel") => setFormData(prev => ({ ...prev, load_type: value }))}
              className="flex space-x-4 mt-2"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="crude" id="crude" data-testid="radio-crude" />
                <Label htmlFor="crude">Crude Oil (Barrels)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="diesel" id="diesel" data-testid="radio-diesel" />
                <Label htmlFor="diesel">Diesel (Gallons)</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="units-input">
                {formData.load_type === 'crude' ? 'Barrels' : 'Gallons'} to Haul
              </Label>
              {(singlePickupHasDefaults || selectedLocationsHaveDefaults) && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="override-defaults"
                    checked={overrideDefaultUnits}
                    onCheckedChange={(checked) => setOverrideDefaultUnits(!!checked)}
                    data-testid="checkbox-override-defaults"
                  />
                  <Label htmlFor="override-defaults" className="text-sm cursor-pointer">
                    Override location defaults
                  </Label>
                </div>
              )}
            </div>
            <Input
              id="units-input"
              type="number"
              className="input-metallic"
              value={formData.units_loaded}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                units_loaded: parseInt(e.target.value) || 0 
              }))}
              disabled={(singlePickupHasDefaults || selectedLocationsHaveDefaults) && !overrideDefaultUnits}
              data-testid="input-units-loaded"
            />
            {(singlePickupHasDefaults || selectedLocationsHaveDefaults) && !overrideDefaultUnits && (
              <div className="text-xs text-muted-foreground">
                Using location-specific default volumes
                {!batchMode && selectedPickupLocation && (
                  <span className="font-medium"> ({selectedPickupLocation.default_units_loaded} {formData.load_type === 'crude' ? 'barrels' : 'gallons'})</span>
                )}
              </div>
            )}
          </div>

          {/* Show warning if selected locations have missing coordinates */}
          {!batchMode && hasInvalidCoords && (formData.pickup_location_id || formData.dropoff_location_id) && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-destructive">Missing GPS Coordinates</div>
                <div className="text-destructive/80 mt-1">
                  {pickupMissingCoords && `Pickup location '${selectedPickup?.name}' is missing coordinates. `}
                  {dropoffMissingCoords && `Dropoff location '${selectedDropoff?.name}' is missing coordinates. `}
                  Please add latitude and longitude in the Locations page before calculating routes.
                </div>
              </div>
            </div>
          )}

          {/* Show warning for batch mode */}
          {batchMode && batchHasInvalidCoords && (
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-md border border-destructive/20">
              <AlertTriangle className="w-5 h-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-medium text-destructive">Missing GPS Coordinates</div>
                <div className="text-destructive/80 mt-1">
                  {batchPickupsWithMissingCoords.length > 0 && (
                    <div>
                      Pickup locations missing coordinates: {batchPickupsWithMissingCoords.map(id => {
                        const loc = locations.find(l => l.location_id === id);
                        return loc?.name;
                      }).filter(Boolean).join(', ')}
                    </div>
                  )}
                  {dropoffMissingCoords && (
                    <div>Dropoff location '{selectedDropoff?.name}' is missing coordinates</div>
                  )}
                  <div className="mt-1">Please add latitude and longitude in the Locations page before calculating routes.</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timing & Speed Card */}
      <Card className="card-metallic">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Clock className="w-5 h-5 text-primary mr-2" />
            Timing & Speed
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="mph">Average MPH</Label>
              <Input
                id="mph"
                type="number"
                className="input-metallic"
                value={formData.avg_mph}
                onChange={(e) => setFormData(prev => ({ 
                  ...prev, 
                  avg_mph: parseInt(e.target.value) || 0 
                }))}
                data-testid="input-mph"
              />
            </div>
            <div>
              {/* Empty column for grid layout consistency */}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="pickup-time">Pickup Time (min)</Label>
              <Input
                id="pickup-time"
                type="number"
                className="input-metallic"
                value={formData.pickup_time_min}
                onChange={(e) => {
                  if (batchMode) setOverrideLocationDefaults(true);
                  setFormData(prev => ({ 
                    ...prev, 
                    pickup_time_min: parseInt(e.target.value) || 0 
                  }));
                }}
                data-testid="input-pickup-time"
              />
            </div>
            <div>
              <Label htmlFor="dropoff-time">Dropoff Time (min)</Label>
              <Input
                id="dropoff-time"
                type="number"
                className="input-metallic"
                value={formData.dropoff_time_min}
                onChange={(e) => {
                  if (batchMode) setOverrideLocationDefaults(true);
                  setFormData(prev => ({ 
                    ...prev, 
                    dropoff_time_min: parseInt(e.target.value) || 0 
                  }));
                }}
                data-testid="input-dropoff-time"
              />
            </div>
          </div>
          {batchMode && (
            <p className="text-xs text-muted-foreground mt-1">
              {overrideLocationDefaults 
                ? "Overriding: These times will apply to all locations in this batch."
                : "Using each location's saved load/unload times. Edit above to override all."}
            </p>
          )}

          <div>
            <Label htmlFor="traffic-buffer">Traffic Buffer (min)</Label>
            <Input
              id="traffic-buffer"
              type="number"
              className="input-metallic"
              value={formData.traffic_buffer_min}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                traffic_buffer_min: parseInt(e.target.value) || 0 
              }))}
              data-testid="input-traffic-buffer"
            />
          </div>

          <div>
            <Label htmlFor="hourly-target">Target Hourly Rate ($)</Label>
            <Input
              id="hourly-target"
              type="number"
              className="input-metallic"
              value={formData.hourly_target_usd}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                hourly_target_usd: parseInt(e.target.value) || 0 
              }))}
              data-testid="input-hourly-target"
            />
          </div>
        </CardContent>
      </Card>

      {/* Deadhead Options Card */}
      <Card className="card-metallic">
        <CardHeader>
          <CardTitle className="flex items-center">
            <ArrowLeftRight className="w-5 h-5 text-primary mr-2" />
            Deadhead Options
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div>
              <Label htmlFor="deadhead-select">Deadhead Miles</Label>
              <Select 
                value={formData.deadhead_type} 
                onValueChange={(value: "none" | "oneway" | "portaltoportal" | "roundtrip") => setFormData(prev => ({ 
                  ...prev, 
                  deadhead_type: value 
                }))}
              >
                <SelectTrigger id="deadhead-select" data-testid="select-deadhead-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Deadhead</SelectItem>
                  <SelectItem value="oneway">One-way (Yard to Pickup)</SelectItem>
                  <SelectItem value="portaltoportal">Portal to Portal (Yard to Pickup + Dropoff to Yard)</SelectItem>
                  <SelectItem value="roundtrip">Round trip (Pickup to Dropoff x 2)</SelectItem>
                </SelectContent>
              </Select>
              <div className="text-xs text-muted-foreground mt-1">
                {formData.deadhead_type === "none" && "No empty miles from base yard"}
                {formData.deadhead_type === "oneway" && "Includes empty miles from yard to pickup location"}
                {formData.deadhead_type === "portaltoportal" && "Includes empty miles to and from base yard"}
                {formData.deadhead_type === "roundtrip" && "Includes return trip (pickup to dropoff distance x 2)"}
              </div>
            </div>
            
            {(formData.deadhead_type === 'oneway' || formData.deadhead_type === 'portaltoportal') && (
              <div>
                <Label htmlFor="base-yard-select">Base Yard</Label>
                <Select 
                  value={formData.base_yard_id} 
                  onValueChange={(value) => setFormData(prev => ({ ...prev, base_yard_id: value }))}
                >
                  <SelectTrigger id="base-yard-select" data-testid="select-base-yard">
                    <SelectValue placeholder="Select base yard..." />
                  </SelectTrigger>
                  <SelectContent>
                    {locations.filter(l => l.role === 'yard' || l.is_base_yard).map(location => (
                      <SelectItem key={location.location_id} value={location.location_id}>
                        {location.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="text-xs text-muted-foreground mt-1">
                  Base yard is the starting point for deadhead calculations
                </div>
              </div>
            )}
            
            <div className="flex items-center space-x-2">
              <Checkbox
                id="symmetric-routes"
                checked={formData.assume_symmetric_route}
                onCheckedChange={(checked) => setFormData(prev => ({ 
                  ...prev, 
                  assume_symmetric_route: !!checked 
                }))}
                data-testid="checkbox-symmetric-routes"
              />
              <Label htmlFor="symmetric-routes">Assume symmetric routes for empty legs</Label>
            </div>
          </div>

        </CardContent>
      </Card>

      {/* Calculate Button */}
      <Button 
        variant="gold"
        className="w-full" 
        size="lg" 
        onClick={handleCalculate}
        disabled={calculateMutation.isPending || batchCalculateMutation.isPending || (batchMode ? batchHasInvalidCoords : hasInvalidCoords)}
        data-testid="button-calculate"
      >
        {batchMode ? (
          <Users className="w-5 h-5 mr-2" />
        ) : (
          <Calculator className="w-5 h-5 mr-2" />
        )}
        {(calculateMutation.isPending || batchCalculateMutation.isPending) 
          ? 'Calculating...' 
          : batchMode 
            ? 'Calculate Batch Routes & Rates' 
            : 'Calculate Routes & Rates'
        }
      </Button>
      {/* Disabled button tooltip */}
      {(batchMode ? batchHasInvalidCoords : hasInvalidCoords) && (
        <div className="text-xs text-destructive text-center mt-1">
          Cannot calculate routes - selected locations are missing GPS coordinates
        </div>
      )}
    </div>
  );
}
