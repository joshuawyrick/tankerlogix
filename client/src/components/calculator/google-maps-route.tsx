import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Map, RotateCcw, Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useGoogleMaps, decodePolyline } from "@/hooks/use-google-maps";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatRatePerUnit } from "@shared/rate-unit";
import { type MapData, validateMapData } from "@/types/map-data";

interface Props {
  data: MapData;
  selectedRoute: string | null;
  onSelectRoute?: (routeId: string) => void;
  /** Notifies the parent when a dragged custom route's recalculation arrives (or is cleared with null) */
  onCustomCalcChange?: (calc: any | null) => void;
}

declare global {
  interface Window {
    google: any;
    initMap?: () => void;
  }
}

export default function GoogleMapsRoute({ data, selectedRoute, onSelectRoute, onCustomCalcChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const polylineRefs = useRef<any[]>([]);
  const directionsRendererRef = useRef<any>(null);
  const originalDirectionsRef = useRef<any>(null);
  const recalcTimerRef = useRef<any>(null);
  const ignoreChangeRef = useRef(false);
  const recalcSeqRef = useRef(0);
  const customRouteGeomRef = useRef<{ miles: number; polyline: string | null } | null>(null);
  const [customCalc, setCustomCalc] = useState<any>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const [dragEnabled, setDragEnabled] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  const { isLoaded: mapLoaded } = useGoogleMaps();

  // Keep the latest callback in a ref so the map-building effect doesn't
  // re-run when the parent re-renders with a new function identity
  const onCustomCalcChangeRef = useRef(onCustomCalcChange);
  onCustomCalcChangeRef.current = onCustomCalcChange;
  const onSelectRouteRef = useRef(onSelectRoute);
  onSelectRouteRef.current = onSelectRoute;

  const updateCustomCalc = (calc: any | null) => {
    setCustomCalc(calc);
    onCustomCalcChangeRef.current?.(calc);
  };

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !data?.calculations) return;

    // Validate required fields in development so missing-field bugs surface early
    validateMapData(data, "GoogleMapsRoute");

    // Initialize map
    const map = new window.google.maps.Map(mapRef.current, {
      zoom: 10,
      mapId: 'DEMO_MAP_ID',
      mapTypeId: 'hybrid',
      clickableIcons: false,
      streetViewControl: false,
      fullscreenControl: false,
      gestureHandling: 'greedy', // Enable mouse wheel zoom without ctrl key
      mapTypeControl: true,
      mapTypeControlOptions: {
        mapTypeIds: ['roadmap', 'satellite', 'hybrid', 'terrain'],
        position: window.google.maps.ControlPosition.TOP_RIGHT
      },
    });
    googleMapRef.current = map;

    // Clear existing polylines
    polylineRefs.current.forEach(p => p.setMap(null));
    polylineRefs.current = [];

    // Get locations from data - support both formats
    let pickup, dropoff;
    
    // Check if coordinates are passed directly (batch mode)
    if (data.pickup_lat !== undefined && data.pickup_lon !== undefined) {
      pickup = { lat: data.pickup_lat, lon: data.pickup_lon };
    } else if (data.locations && data.pickup_location_id) {
      pickup = data.locations[data.pickup_location_id];
    }
    
    if (data.dropoff_lat !== undefined && data.dropoff_lon !== undefined) {
      dropoff = { lat: data.dropoff_lat, lon: data.dropoff_lon };
    } else if (data.locations && data.dropoff_location_id) {
      dropoff = data.locations[data.dropoff_location_id];
    }
    
    // Fallback to first calculation's coordinates if available
    if (!pickup && data.calculations?.[0]) {
      const firstCalc = data.calculations[0];
      if (firstCalc.pickup_lat !== undefined && firstCalc.pickup_lon !== undefined) {
        pickup = { lat: firstCalc.pickup_lat, lon: firstCalc.pickup_lon };
      }
    }
    
    if (!dropoff && data.calculations?.[0]) {
      const firstCalc = data.calculations[0];
      if (firstCalc.dropoff_lat !== undefined && firstCalc.dropoff_lon !== undefined) {
        dropoff = { lat: firstCalc.dropoff_lat, lon: firstCalc.dropoff_lon };
      }
    }
    
    // Only use fallback if no coordinates found at all
    if (!pickup || !dropoff) {
      console.error('Missing pickup or dropoff coordinates', { pickup, dropoff, data });
      return; // Don't render map with invalid coordinates
    }

    // Create bounds
    const bounds = new window.google.maps.LatLngBounds();
    
    // Add markers (AdvancedMarkerElement — modern, non-deprecated)
    const makeIcon = (url: string) => {
      const img = document.createElement('img');
      img.src = url;
      img.width = 32;
      img.height = 32;
      return img;
    };

    const pickupPos = { lat: pickup.lat, lng: pickup.lon };
    new window.google.maps.marker.AdvancedMarkerElement({
      position: pickupPos,
      map,
      title: data.pickup_name || data.pickup || 'Pickup',
      content: makeIcon('https://maps.google.com/mapfiles/ms/icons/green-dot.png'),
    });
    bounds.extend(pickupPos);

    const dropoffPos = { lat: dropoff.lat, lng: dropoff.lon };
    new window.google.maps.marker.AdvancedMarkerElement({
      position: dropoffPos,
      map,
      title: data.dropoff_name || data.dropoff || 'Dropoff',
      content: makeIcon('https://maps.google.com/mapfiles/ms/icons/red-dot.png'),
    });
    bounds.extend(dropoffPos);

    // Add base yard marker if deadhead is included
    if (data.include_deadhead) {
      const basePos = { lat: data.base_lat || 35.3, lng: data.base_lon || -119.1 };
      new window.google.maps.marker.AdvancedMarkerElement({
        position: basePos,
        map,
        title: 'Base Yard',
        content: makeIcon('https://maps.google.com/mapfiles/ms/icons/yellow-dot.png'),
      });
      bounds.extend(basePos);
    }

    // Draw routes
    const colors = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6'];
    
    data.calculations.forEach((calc: any, index: number) => {
      if (!calc.polyline) return;
      
      const path = decodePolyline(calc.polyline);
      const isSelected = selectedRoute === calc.id || (!selectedRoute && index === 0);
      
      const polyline = new window.google.maps.Polyline({
        path: path,
        geodesic: true,
        strokeColor: colors[index % colors.length],
        strokeOpacity: isSelected ? 0.9 : 0.6,
        strokeWeight: isSelected ? 5 : 3,
        clickable: true,
        zIndex: isSelected ? 100 : index,
      });
      
      polyline.setMap(map);
      polylineRefs.current.push(polyline);
      
      // Add click handler
      polyline.addListener('click', () => {
        onSelectRouteRef.current?.(calc.id);
      });
      
      // Add to bounds
      path.forEach(point => {
        bounds.extend(point);
      });
    });

    // Fit map to bounds
    map.fitBounds(bounds);

    // --- Draggable selected route (Google-Maps-style) ---
    // Reset any prior custom-route state when the map is rebuilt
    updateCustomCalc(null);
    setRecalcError(null);
    setIsRecalculating(false);
    setDragEnabled(false);
    customRouteGeomRef.current = null;
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }
    originalDirectionsRef.current = null;

    const request = data.request;
    const selCalc = selectedRoute
      ? data.calculations.find((c: any) => c.id === selectedRoute)
      : data.calculations[0];
    const selIndex = selCalc ? data.calculations.indexOf(selCalc) : 0;

    if (request && selCalc && window.google.maps.DirectionsService) {
      const directionsService = new window.google.maps.DirectionsService();
      directionsService.route(
        {
          origin: pickupPos,
          destination: dropoffPos,
          travelMode: window.google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: true,
        },
        (result: any, status: string) => {
          // The effect may have re-run while the request was in flight
          if (status !== 'OK' || !result || googleMapRef.current !== map) return;

          // Match the server-selected alternative by summary, else by closest distance
          let routeIndex = result.routes.findIndex(
            (r: any) => r.summary && r.summary === (selCalc.summary || selCalc.route_summary)
          );
          if (routeIndex < 0) {
            let best = Infinity;
            result.routes.forEach((r: any, i: number) => {
              const miles = r.legs.reduce((t: number, l: any) => t + l.distance.value, 0) / 1609.34;
              const diff = Math.abs(miles - selCalc.distance_miles);
              if (diff < best) { best = diff; routeIndex = i; }
            });
          }

          originalDirectionsRef.current = result;
          ignoreChangeRef.current = true;

          const renderer = new window.google.maps.DirectionsRenderer({
            map,
            directions: result,
            routeIndex: Math.max(routeIndex, 0),
            draggable: true,
            suppressMarkers: true,
            preserveViewport: true,
            polylineOptions: {
              strokeColor: colors[selIndex % colors.length],
              strokeOpacity: 0.9,
              strokeWeight: 5,
              zIndex: 200,
            },
          });
          directionsRendererRef.current = renderer;

          // Hide the static polyline for the selected route — the draggable
          // renderer now displays it
          const staticSelected = polylineRefs.current[selIndex];
          if (staticSelected) staticSelected.setVisible(false);
          setDragEnabled(true);

          renderer.addListener('directions_changed', () => {
            if (ignoreChangeRef.current) {
              ignoreChangeRef.current = false;
              return;
            }
            const dirs = renderer.getDirections();
            const route = dirs?.routes?.[renderer.getRouteIndex?.() ?? 0];
            if (!route) return;

            const meters = route.legs.reduce((t: number, l: any) => t + l.distance.value, 0);
            const miles = meters / 1609.34;

            // Capture the dragged path so it can be saved for reuse. The JS
            // API exposes overview_polyline as a string on some versions and
            // as {points} on others; fall back to encoding overview_path.
            let encodedPath: string | null = null;
            const op = (route as any).overview_polyline;
            if (typeof op === 'string') encodedPath = op;
            else if (op?.points) encodedPath = op.points;
            else if (route.overview_path && window.google.maps.geometry?.encoding) {
              encodedPath = window.google.maps.geometry.encoding.encodePath(route.overview_path);
            }
            customRouteGeomRef.current = { miles, polyline: encodedPath };

            // Debounce: dragging fires multiple change events in quick succession
            if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
            setIsRecalculating(true);
            setRecalcError(null);
            const seq = ++recalcSeqRef.current;
            recalcTimerRef.current = setTimeout(async () => {
              try {
                const res = await apiRequest('POST', '/api/recalculate-route', {
                  ...request,
                  route: {
                    miles,
                    summary: 'Custom (dragged)',
                  },
                });
                const json = await res.json();
                if (seq === recalcSeqRef.current) {
                  updateCustomCalc(json.calculation);
                  setIsRecalculating(false);
                }
              } catch (err: any) {
                if (seq === recalcSeqRef.current) {
                  setIsRecalculating(false);
                  setRecalcError(err?.message || 'Failed to recalculate the dragged route');
                }
              }
            }, 400);
          });
        }
      );
    }

    return () => {
      if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
      recalcSeqRef.current++;
    };
    // onSelectRoute is intentionally accessed via a ref: parents may pass a new
    // inline function every render, and re-running this effect would rebuild
    // the map and wipe any dragged custom route.
  }, [mapLoaded, data, selectedRoute]);

  const handleResetRoute = () => {
    const renderer = directionsRendererRef.current;
    const original = originalDirectionsRef.current;
    recalcSeqRef.current++; // invalidate any in-flight recalculation
    if (recalcTimerRef.current) clearTimeout(recalcTimerRef.current);
    updateCustomCalc(null);
    setRecalcError(null);
    setIsRecalculating(false);
    customRouteGeomRef.current = null;
    if (renderer && original) {
      // Restore the original (undragged) directions; suppress the
      // directions_changed event this fires so no recalculation is triggered.
      ignoreChangeRef.current = true;
      renderer.setDirections(original);
    }
  };

  const handleOpenSaveDialog = () => {
    const pickupName = data.pickup_name || data.pickup || 'Pickup';
    const dropoffName = data.dropoff_name || data.dropoff || 'Dropoff';
    setSaveName(`${pickupName} → ${dropoffName} (Custom)`);
    setSaveDialogOpen(true);
  };

  const handleSaveCustomRoute = async () => {
    const request = data.request;
    const geom = customRouteGeomRef.current;
    if (!request || !geom || !customCalc || !saveName.trim()) return;
    setIsSaving(true);
    try {
      await apiRequest('POST', '/api/contracted-routes', {
        route_name: saveName.trim(),
        pickup_location_id: request.pickup_location_id,
        dropoff_location_id: request.dropoff_location_id,
        product_type: request.load_type,
        avg_volume: request.units_loaded,
        rate_per_unit: customCalc.rate_per_unit,
        rate_type: request.load_type === 'diesel' ? 'per_gallon' : 'per_barrel',
        notes: `Saved custom (dragged) route — ${geom.miles.toFixed(1)} loaded mi`,
        is_custom: true,
        custom_miles: geom.miles,
        custom_polyline: geom.polyline || undefined,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      setSaveDialogOpen(false);
      toast({
        title: 'Custom Route Saved',
        description: `"${saveName.trim()}" was saved and will appear as a route option for this pickup/dropoff pair.`,
      });
    } catch (err: any) {
      toast({
        title: 'Save Failed',
        description: err?.message || 'Failed to save the custom route',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Update polylines when selection changes
  useEffect(() => {
    if (!polylineRefs.current.length) return;
    
    const colors = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6'];
    
    data?.calculations?.forEach((calc: any, index: number) => {
      const polyline = polylineRefs.current[index];
      if (!polyline) return;
      
      const isSelected = selectedRoute === calc.id || (!selectedRoute && index === 0);
      polyline.setOptions({
        strokeOpacity: isSelected ? 0.9 : 0.6,
        strokeWeight: isSelected ? 5 : 3,
        zIndex: isSelected ? 100 : index,
      });
    });
  }, [selectedRoute, data]);

  if (!data || !data.calculations) {
    return null;
  }

  const selectedCalc = selectedRoute ? 
    data.calculations.find((calc: any) => calc.id === selectedRoute) : 
    data.calculations[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Map className="w-5 h-5 text-primary mr-2" />
            Route Visualization
          </div>
          <div className="text-sm font-normal text-muted-foreground">
            Click on any route to select it
          </div>
        </CardTitle>
        <div className="flex items-center justify-between mt-2 text-sm">
          <div className="flex items-center space-x-4 text-muted-foreground">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              Route 1
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
              Route 2
            </div>
            {data.calculations.length > 2 && (
              <div className="flex items-center">
                <div className="w-3 h-3 bg-orange-500 rounded-full mr-2"></div>
                Route 3+
              </div>
            )}
          </div>
          {selectedCalc && (
            <div className="text-xs font-medium text-green-600">
              ✓ {selectedCalc.summary}
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="relative">
          {/* Google Maps Container - Responsive height */}
          <div ref={mapRef} className="h-[500px] lg:h-[600px] xl:h-[700px] w-full" data-testid="google-map-container"></div>
          
          {/* Map controls overlay - Removed since Google Maps has its own controls */}
          
          {/* Route Options List - Left side, above selected details */}
          <div className="absolute top-20 left-4 bg-card border border-border rounded-md shadow-md p-1.5 max-w-[200px]">
            <div className="text-xs text-muted-foreground mb-1 px-1">Select Route</div>
            {data.calculations.map((calc: any, index: number) => {
              const isSelected = selectedRoute === calc.id || (!selectedRoute && index === 0);
              const color = index === 0 ? "bg-green-500" : index === 1 ? "bg-blue-500" : index === 2 ? "bg-orange-500" : "bg-purple-500";
              
              return (
                <div
                  key={calc.id}
                  className={`flex items-center justify-between px-2 py-1 rounded cursor-pointer transition-colors ${
                    isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                  onClick={() => onSelectRoute?.(calc.id)}
                >
                  <div className="flex items-center space-x-1.5">
                    <div className={`w-2 h-2 rounded-full ${color}`}></div>
                    <div>
                      <div className="text-xs font-medium">
                        Route {index + 1}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {calc.distance_miles.toFixed(1)} mi
                      </div>
                    </div>
                  </div>
                  {isSelected && (
                    <div className="text-green-600 text-[10px]">✓</div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* Drag hint - Top center */}
          {dragEnabled && !customCalc && !isRecalculating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-card/90 border border-border rounded-md shadow-md px-2 py-1 text-[10px] text-muted-foreground pointer-events-none">
              Drag the highlighted route to customize it
            </div>
          )}

          {/* Selected Route Details - Bottom left */}
          {selectedCalc && (() => {
            const displayCalc = customCalc || selectedCalc;
            const isCustom = !!customCalc;
            return (
              <div className="absolute bottom-4 left-4 bg-card border border-border rounded-md shadow-md px-2 py-1.5 max-w-[200px]" data-testid="selected-route-overlay">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] text-muted-foreground">
                    {isCustom ? 'Custom route' : 'Selected'}
                  </div>
                  {isRecalculating && (
                    <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>
                <div className="text-xs text-foreground font-medium truncate">
                  {isCustom ? 'Custom (dragged)' : selectedCalc.summary}
                </div>
                <div className="text-xs text-foreground">
                  {displayCalc.total_miles.toFixed(1)} mi
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {Math.floor(displayCalc.total_time_hr)}h {Math.round((displayCalc.total_time_hr % 1) * 60)}m
                </div>
                <div className="text-xs text-green-600 font-medium">
                  {formatRatePerUnit(displayCalc.rate_per_unit, data.load_type)}
                </div>
                {recalcError && (
                  <div className="text-[10px] text-destructive mt-1">
                    {recalcError}
                  </div>
                )}
                {isCustom && !isRecalculating && (
                  <Button
                    size="sm"
                    className="h-6 px-2 mt-1 text-[10px] w-full"
                    onClick={handleOpenSaveDialog}
                    data-testid="button-save-custom-route"
                  >
                    <Save className="w-3 h-3 mr-1" />
                    Save route
                  </Button>
                )}
                {(isCustom || recalcError) && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 mt-1 text-[10px] w-full"
                    onClick={handleResetRoute}
                    data-testid="button-reset-route"
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />
                    Reset route
                  </Button>
                )}
              </div>
            );
          })()}
        </div>
      </CardContent>

      {/* Save custom route dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Custom Route</DialogTitle>
            <DialogDescription>
              Save this dragged route so it appears alongside contracted routes and
              shows up as a route option whenever you calculate this pickup/dropoff pair.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="custom-route-name">Route name</Label>
            <Input
              id="custom-route-name"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              placeholder="e.g. Negotiated bypass route"
              data-testid="input-custom-route-name"
            />
            {customCalc && (
              <div className="text-xs text-muted-foreground">
                {customCalc.distance_miles?.toFixed(1)} loaded mi ·{' '}
                {formatRatePerUnit(customCalc.rate_per_unit, data.load_type)}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustomRoute}
              disabled={isSaving || !saveName.trim()}
              data-testid="button-confirm-save-custom-route"
            >
              {isSaving ? 'Saving…' : 'Save Route'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}