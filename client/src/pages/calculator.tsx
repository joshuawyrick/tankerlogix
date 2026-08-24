import { useEffect, useMemo, useState } from "react";
import CalculatorInputs from "@/components/calculator/calculator-inputs";
import ResultsTable from "@/components/calculator/results-table";
import RouteMap from "@/components/calculator/route-map";
import GoogleMapsRoute from "@/components/calculator/google-maps-route";
import BatchResultsTable from "@/components/calculator/batch-results-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin } from "lucide-react";
import { type MapData } from "@/types/map-data";

export default function Calculator() {
  const [calculationData, setCalculationData] = useState<any>(null);
  const [batchData, setBatchData] = useState<any>(null);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [selectedBatchPickup, setSelectedBatchPickup] = useState<string | null>(null);
  const [selectedBatchDropoff, setSelectedBatchDropoff] = useState<string | null>(null);
  const [selectedBatchRoute, setSelectedBatchRoute] = useState<number>(0);
  // Recalculated numbers for a dragged (custom) route on the map; null when
  // no custom route is active. Applies to the currently selected route.
  const [customCalc, setCustomCalc] = useState<any>(null);

  const handleRegularCalculation = (data: any) => {
    setCalculationData(data);
    setBatchData(null); // Clear batch data when doing regular calculation
    setCustomCalc(null);
  };

  const handleBatchCalculation = (data: any) => {
    setBatchData(data);
    setCalculationData(null); // Clear regular data when doing batch calculation
    setCustomCalc(null);
  };

  // Auto-select first pickup with routes if none selected (batch mode)
  useEffect(() => {
    if (batchData?.results?.length && !selectedBatchPickup) {
      const firstWithRoutes = batchData.results.find((r: any) => r.calculations && r.calculations.length > 0);
      if (firstWithRoutes) {
        setSelectedBatchPickup(firstWithRoutes.pickup_location_id);
        setSelectedBatchDropoff(firstWithRoutes.dropoff_location_id);
      }
    }
  }, [batchData, selectedBatchPickup]);

  // The currently selected batch pickup/dropoff pair
  const selectedPickupData = useMemo(() => {
    if (!batchData?.results) return null;
    return batchData.results.find((r: any) =>
      r.pickup_location_id === selectedBatchPickup &&
      r.dropoff_location_id === selectedBatchDropoff
    ) || null;
  }, [batchData, selectedBatchPickup, selectedBatchDropoff]);

  // Memoized so the map's identity only changes when the selected pair truly
  // changes — otherwise every parent re-render (e.g. a dragged-route
  // recalculation arriving) would rebuild the map and wipe the custom route
  const batchMapData = useMemo<MapData | null>(() => {
    if (!selectedPickupData?.calculations?.length) return null;
    return {
      load_type: batchData.load_type,
      // Per-pair calculation request so the map can recalculate
      // rates when the user drags the route
      request: batchData.request ? {
        ...batchData.request,
        pickup_location_id: selectedPickupData.pickup_location_id,
        dropoff_location_id: selectedPickupData.dropoff_location_id,
        units_loaded: selectedPickupData.units_loaded,
        pickup_time_min: selectedPickupData.pickup_time_min,
        dropoff_time_min: selectedPickupData.dropoff_time_min,
      } : undefined,
      pickup_name: selectedPickupData.pickup_name,
      dropoff_name: selectedPickupData.dropoff_name,
      // Coordinates supplied at the top level for proper marker placement
      pickup_lat: selectedPickupData.pickup_lat,
      pickup_lon: selectedPickupData.pickup_lon,
      dropoff_lat: selectedPickupData.dropoff_lat,
      dropoff_lon: selectedPickupData.dropoff_lon,
      // Sort by distance (shortest first) so route-<index> ids match
      // the batch table's distance-sorted route columns — the map,
      // table, and exports all refer to the same route by index
      calculations: [...selectedPickupData.calculations]
        .sort((a: any, b: any) => a.distance_miles - b.distance_miles)
        .map((calc: any, index: number) => ({
          ...calc,
          id: `route-${index}`,
          summary: calc.route_summary || calc.summary,
        })),
    };
  }, [batchData, selectedPickupData]);

  return (
    <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel - Inputs - Narrower when batch mode */}
        <div className={batchData ? "col-span-12 xl:col-span-3 lg:col-span-4" : "col-span-12 lg:col-span-4"}>
          <CalculatorInputs 
            onCalculate={handleRegularCalculation}
            onBatchCalculate={handleBatchCalculation}
            data-testid="calculator-inputs"
          />
        </div>

        {/* Right Panel - Results & Map - Wider when batch mode */}
        <div className={batchData ? "col-span-12 xl:col-span-9 lg:col-span-8 space-y-6" : "col-span-12 lg:col-span-8 space-y-6"}>
          {batchData ? (
            <>
              <BatchResultsTable 
                data={batchData}
                selectedPickup={selectedBatchPickup}
                selectedDropoff={selectedBatchDropoff}
                onSelectRow={(pickupId, dropoffId) => {
                  setSelectedBatchPickup(pickupId);
                  setSelectedBatchDropoff(dropoffId);
                }}
                selectedRoute={selectedBatchRoute}
                onSelectRoute={setSelectedBatchRoute}
                customCalc={customCalc}
                data-testid="batch-results-table"
              />
              {/* Show map for selected batch route */}
              {batchMapData && (
                batchMapData.calculations[0]?.polyline ? (
                  <GoogleMapsRoute 
                    data={batchMapData}
                    selectedRoute={`route-${selectedBatchRoute}`}
                    onSelectRoute={(routeId: string) => {
                      const index = parseInt(routeId.replace('route-', ''));
                      setSelectedBatchRoute(index);
                    }}
                    onCustomCalcChange={setCustomCalc}
                    data-testid="batch-google-map"
                  />
                ) : (
                  <Card className="card-metallic">
                    <CardHeader className="bg-gradient-chrome/30 border-b border-border/50">
                      <CardTitle className="flex items-center">
                        <MapPin className="w-5 h-5 text-primary mr-2" />
                        Route Visualization
                      </CardTitle>
                      <p className="text-sm text-muted-foreground mt-1">
                        {batchMapData.pickup_name} → {batchMapData.dropoff_name}
                      </p>
                    </CardHeader>
                    <CardContent className="p-8 text-center text-muted-foreground">
                      <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>Map visualization not available for this route.</p>
                      <p className="text-sm mt-2">Use the "View Route" links to open in Google Maps.</p>
                    </CardContent>
                  </Card>
                )
              )}
            </>
          ) : calculationData ? (
            <>
              <ResultsTable 
                data={calculationData}
                selectedRoute={selectedRoute}
                onSelectRoute={setSelectedRoute}
                customCalc={customCalc}
                data-testid="results-table"
              />
              {/* Use Google Maps if polyline data is available, otherwise fallback to SVG */}
              {calculationData?.calculations?.[0]?.polyline ? (
                <GoogleMapsRoute 
                  data={calculationData}
                  selectedRoute={selectedRoute}
                  onSelectRoute={setSelectedRoute}
                  onCustomCalcChange={setCustomCalc}
                  data-testid="google-map"
                />
              ) : (
                <RouteMap 
                  data={calculationData}
                  selectedRoute={selectedRoute}
                  onSelectRoute={setSelectedRoute}
                  data-testid="route-map"
                />
              )}
            </>
          ) : (
            <Card className="card-metallic p-8 text-center">
              <div className="text-muted-foreground">
                <div className="text-lg font-medium mb-2">No Calculation Yet</div>
                <p>Select pickup and dropoff locations, then click "Calculate Routes & Rates" to see results.</p>
                <p className="mt-2 text-sm">💡 Try "Batch Mode" to compare multiple pickup locations to the same destination!</p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
