import { useEffect, useRef } from "react";
import { useGoogleMaps } from "@/hooks/use-google-maps";
import { Loader2, MapPin } from "lucide-react";

declare global {
  interface Window {
    google: any;
  }
}

// Default center for the operating region (Kern County / Bakersfield area).
const KERN_COUNTY_CENTER = { lat: 35.35, lng: -118.9 };

interface PinCoords {
  lat: number;
  lon: number;
}

interface Props {
  initialLat?: number | null;
  initialLon?: number | null;
  value: PinCoords | null;
  onChange: (coords: PinCoords) => void;
}

function readLatLng(pos: any): { lat: number; lng: number } | null {
  if (!pos) return null;
  const lat = typeof pos.lat === "function" ? pos.lat() : pos.lat;
  const lng = typeof pos.lng === "function" ? pos.lng() : pos.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  return { lat, lng };
}

export default function MapPinPicker({ initialLat, initialLon, value, onChange }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const { isLoaded, error } = useGoogleMaps();

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    let cancelled = false;

    const hasInitial =
      typeof initialLat === "number" &&
      Number.isFinite(initialLat) &&
      typeof initialLon === "number" &&
      Number.isFinite(initialLon) &&
      !(initialLat === 0 && initialLon === 0);

    const center = hasInitial
      ? { lat: initialLat as number, lng: initialLon as number }
      : KERN_COUNTY_CENTER;

    // Small delay so the popover container is fully laid out before init.
    const timer = setTimeout(() => {
      if (cancelled || !mapRef.current) return;

      const map = new window.google.maps.Map(mapRef.current, {
        zoom: hasInitial ? 13 : 9,
        center,
        mapId: "DEMO_MAP_ID",
        mapTypeId: "hybrid",
        clickableIcons: false,
        streetViewControl: false,
        fullscreenControl: false,
        gestureHandling: "greedy",
        mapTypeControl: true,
        mapTypeControlOptions: {
          mapTypeIds: ["roadmap", "satellite", "hybrid", "terrain"],
          position: window.google.maps.ControlPosition.TOP_RIGHT,
        },
      });

      const setPin = (latLng: { lat: number; lng: number }) => {
        if (markerRef.current) {
          markerRef.current.position = latLng;
        } else {
          const marker = new window.google.maps.marker.AdvancedMarkerElement({
            position: latLng,
            map,
            gmpDraggable: true,
          });
          marker.addListener("dragend", () => {
            const pos = readLatLng(marker.position);
            if (pos) onChangeRef.current({ lat: pos.lat, lon: pos.lng });
          });
          markerRef.current = marker;
        }
      };

      if (hasInitial) {
        setPin(center);
      }

      map.addListener("click", (e: any) => {
        const pos = readLatLng(e.latLng);
        if (!pos) return;
        setPin(pos);
        onChangeRef.current({ lat: pos.lat, lon: pos.lng });
      });
    }, 50);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  if (error) {
    return (
      <div className="h-56 rounded-md border bg-muted/40 flex items-center justify-center text-center text-xs text-muted-foreground px-4">
        Map unavailable: {error}
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-56 rounded-md border bg-muted/40 flex items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        Loading map…
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        ref={mapRef}
        className="h-56 w-full rounded-md border overflow-hidden"
        data-testid="map-pin-picker"
      />
      <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
        <MapPin className="w-3.5 h-3.5 shrink-0" />
        {value ? (
          <span data-testid="text-pinned-coords">
            {value.lat.toFixed(5)}, {value.lon.toFixed(5)}
          </span>
        ) : (
          <span>Click the map to drop a pin</span>
        )}
      </div>
    </div>
  );
}
