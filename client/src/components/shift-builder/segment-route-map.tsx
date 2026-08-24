import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Map } from "lucide-react";
import { useGoogleMaps, decodePolyline } from "@/hooks/use-google-maps";

interface RouteOption {
  id: string;
  summary: string;
  distance_miles: number;
  duration_hours: number;
  polyline: string;
}

interface Props {
  segmentName: string;
  routes: RouteOption[];
  selectedRoute: string | null;
  onSelectRoute: (routeId: string) => void;
  fromLocation: { name: string; lat: number; lon: number };
  toLocation: { name: string; lat: number; lon: number };
}

declare global {
  interface Window {
    google: any;
    initMap?: () => void;
  }
}

export default function SegmentRouteMap({ 
  segmentName, 
  routes, 
  selectedRoute, 
  onSelectRoute,
  fromLocation,
  toLocation 
}: Props) {
  const [open, setOpen] = useState(false);
  const mapRef = useRef<HTMLDivElement>(null);
  const googleMapRef = useRef<any>(null);
  const polylineRefs = useRef<any[]>([]);
  const { isLoaded: mapLoaded } = useGoogleMaps();

  useEffect(() => {
    if (!mapLoaded || !mapRef.current || !routes.length || !open) return;

    // Small delay to ensure container is visible
    setTimeout(() => {
      // Initialize map
      const map = new window.google.maps.Map(mapRef.current, {
        zoom: 10,
        mapId: 'DEMO_MAP_ID',
        mapTypeId: 'hybrid',
        clickableIcons: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: 'greedy',
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

      const fromPos = { lat: fromLocation.lat, lng: fromLocation.lon };
      new window.google.maps.marker.AdvancedMarkerElement({
        position: fromPos,
        map,
        title: fromLocation.name,
        content: makeIcon('https://maps.google.com/mapfiles/ms/icons/green-dot.png'),
      });
      bounds.extend(fromPos);

      const toPos = { lat: toLocation.lat, lng: toLocation.lon };
      new window.google.maps.marker.AdvancedMarkerElement({
        position: toPos,
        map,
        title: toLocation.name,
        content: makeIcon('https://maps.google.com/mapfiles/ms/icons/red-dot.png'),
      });
      bounds.extend(toPos);

      // Draw routes
      const colors = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6'];
      
      routes.forEach((route, index) => {
        if (!route.polyline) return;
        
        const path = decodePolyline(route.polyline);
        const isSelected = selectedRoute === route.id;
        
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
          onSelectRoute(route.id);
        });
        
        // Add to bounds
        path.forEach(point => {
          bounds.extend(point);
        });
      });

      // Fit map to bounds
      map.fitBounds(bounds);
    }, 100); // 100ms delay to ensure dialog is fully rendered

  }, [mapLoaded, routes, selectedRoute, open, fromLocation, toLocation]);

  // Update polylines when selection changes
  useEffect(() => {
    if (!polylineRefs.current.length || !open) return;
    
    const colors = ['#22c55e', '#3b82f6', '#f97316', '#8b5cf6'];
    
    routes.forEach((route, index) => {
      const polyline = polylineRefs.current[index];
      if (!polyline) return;
      
      const isSelected = selectedRoute === route.id;
      polyline.setOptions({
        strokeOpacity: isSelected ? 0.9 : 0.6,
        strokeWeight: isSelected ? 5 : 3,
        zIndex: isSelected ? 100 : index,
      });
    });
  }, [selectedRoute, routes, open]);

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        size="sm"
        variant="outline"
        className="gap-2"
        data-testid={`button-view-map-${segmentName.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <Map className="w-4 h-4" />
        View Map
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{segmentName}</DialogTitle>
            <div className="text-sm text-muted-foreground">
              {fromLocation.name} → {toLocation.name}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            {/* Route options list */}
            <div className="flex gap-2 flex-wrap">
              {routes.map((route, index) => {
                const isSelected = selectedRoute === route.id;
                const color = index === 0 ? "bg-green-500" : index === 1 ? "bg-blue-500" : index === 2 ? "bg-orange-500" : "bg-purple-500";
                
                return (
                  <Button
                    key={route.id}
                    onClick={() => onSelectRoute(route.id)}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="gap-2"
                    data-testid={`button-route-option-${index + 1}`}
                  >
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <div className="text-left">
                      <div className="font-medium">Route {index + 1}</div>
                      <div className="text-xs text-muted-foreground">
                        {route.distance_miles.toFixed(1)} mi • {Math.floor(route.duration_hours)}h {Math.round((route.duration_hours % 1) * 60)}m
                      </div>
                    </div>
                    {isSelected && <span className="text-green-600">✓</span>}
                  </Button>
                );
              })}
            </div>

            {/* Map container */}
            <div ref={mapRef} className="h-[500px] w-full rounded-lg" data-testid="segment-map-container" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}