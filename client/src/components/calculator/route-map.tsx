import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Map, Plus, Minus, Maximize } from "lucide-react";
import { formatRatePerUnit } from "@shared/rate-unit";
import { type MapData, validateMapData } from "@/types/map-data";

interface Props {
  data: MapData;
  selectedRoute: string | null;
  onSelectRoute?: (routeId: string) => void;
}

export default function RouteMap({ data, selectedRoute, onSelectRoute }: Props) {
  if (!data || !data.calculations) {
    return null;
  }

  // Validate required fields in development so missing-field bugs surface early
  validateMapData(data, "RouteMap");

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
          {/* Placeholder map - in production this would be Google Maps */}
          <div className="h-96 bg-gradient-to-b from-blue-100 to-green-100 relative overflow-hidden" data-testid="map-container">
            <div className="absolute inset-0 opacity-90">
              <svg className="w-full h-full" viewBox="0 0 400 300">
                {/* Background terrain */}
                <rect width="400" height="300" fill="#f0f4f7"/>
                
                {/* Mountain ranges */}
                <path d="M 0 100 Q 100 80 200 95 T 400 90" fill="#d1d5db" opacity="0.6"/>
                <path d="M 0 250 Q 150 230 300 240 T 400 235" fill="#d1d5db" opacity="0.6"/>
                
                {/* Routes - draw unselected first, then selected on top */}
                {data.calculations
                  .filter((calc: any) => !(selectedRoute === calc.id || (!selectedRoute && data.calculations.indexOf(calc) === 0)))
                  .map((calc: any, index: number) => {
                    const actualIndex = data.calculations.indexOf(calc);
                    const color = actualIndex === 0 ? "#22c55e" : actualIndex === 1 ? "#3b82f6" : "#f97316";
                    
                    // Generate unique path for each route
                    const paths = [
                      "M 60 200 Q 150 120 240 140 Q 300 150 340 130",
                      "M 60 200 Q 120 160 200 170 Q 280 180 340 130", 
                      "M 60 200 Q 180 100 280 110 Q 320 115 340 130"
                    ];
                    
                    return (
                      <g key={calc.id}>
                        <path 
                          d={paths[actualIndex % paths.length]} 
                          stroke={color} 
                          strokeWidth="3" 
                          fill="none" 
                          opacity="0.4"
                          style={{ cursor: 'pointer' }}
                          onClick={() => onSelectRoute?.(calc.id)}
                        />
                        {/* Invisible wider path for easier clicking */}
                        <path 
                          d={paths[actualIndex % paths.length]} 
                          stroke="transparent" 
                          strokeWidth="12" 
                          fill="none"
                          style={{ cursor: 'pointer' }}
                          onClick={() => onSelectRoute?.(calc.id)}
                        />
                      </g>
                    );
                  })}
                
                {/* Draw selected route on top */}
                {data.calculations
                  .filter((calc: any) => selectedRoute === calc.id || (!selectedRoute && data.calculations.indexOf(calc) === 0))
                  .map((calc: any) => {
                    const actualIndex = data.calculations.indexOf(calc);
                    const color = actualIndex === 0 ? "#22c55e" : actualIndex === 1 ? "#3b82f6" : "#f97316";
                    
                    const paths = [
                      "M 60 200 Q 150 120 240 140 Q 300 150 340 130",
                      "M 60 200 Q 120 160 200 170 Q 280 180 340 130", 
                      "M 60 200 Q 180 100 280 110 Q 320 115 340 130"
                    ];
                    
                    return (
                      <g key={`selected-${calc.id}`}>
                        {/* White background stroke for selected route */}
                        <path 
                          d={paths[actualIndex % paths.length]} 
                          stroke="white" 
                          strokeWidth="7" 
                          fill="none"
                        />
                        <path 
                          d={paths[actualIndex % paths.length]} 
                          stroke={color} 
                          strokeWidth="5" 
                          fill="none" 
                          opacity="0.9"
                          style={{ cursor: 'pointer' }}
                          onClick={() => onSelectRoute?.(calc.id)}
                        />
                        {/* Animated dots on selected route */}
                        <path 
                          d={paths[actualIndex % paths.length]} 
                          stroke={color} 
                          strokeWidth="5" 
                          fill="none"
                          strokeDasharray="10 10"
                          opacity="0.3"
                        >
                          <animate attributeName="stroke-dashoffset" values="0;20" dur="1s" repeatCount="indefinite" />
                        </path>
                      </g>
                    );
                  })}
                
                {/* Location markers */}
                <circle cx="60" cy="200" r="6" fill="#ef4444"/> {/* Base Yard */}
                <circle cx="100" cy="180" r="5" fill="#06b6d4"/> {/* Pickup */}
                <circle cx="340" cy="130" r="5" fill="#8b5cf6"/> {/* Dropoff */}
                
                {/* Location labels */}
                <text x="65" y="195" fontSize="10" fill="#374151">Base Yard</text>
                <text x="105" y="175" fontSize="10" fill="#374151">{data.pickup}</text>
                <text x="285" y="125" fontSize="10" fill="#374151">{data.dropoff}</text>
              </svg>
            </div>
            
            {/* Map controls overlay */}
            <div className="absolute top-4 right-4 bg-card border border-border rounded-md shadow-md p-2">
              <div className="flex flex-col space-y-1">
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-zoom-in">
                  <Plus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-zoom-out">
                  <Minus className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" className="h-8 w-8 p-0" data-testid="button-fullscreen">
                  <Maximize className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Selected Route Details */}
            {selectedCalc && (
              <div className="absolute bottom-4 left-4 bg-card border border-border rounded-md shadow-md px-3 py-2">
                <div className="text-xs text-muted-foreground mb-1">Selected Route</div>
                <div className="text-sm text-foreground font-medium">
                  {selectedCalc.summary}
                </div>
                <div className="text-sm text-foreground">
                  Distance: {selectedCalc.total_miles.toFixed(1)} mi
                </div>
                <div className="text-xs text-muted-foreground">
                  Est. time: {Math.floor(selectedCalc.total_time_hr)}h {Math.round((selectedCalc.total_time_hr % 1) * 60)}m
                </div>
                <div className="text-sm text-green-600 font-medium mt-1">
                  {formatRatePerUnit(selectedCalc.rate_per_unit, data.load_type)}
                </div>
              </div>
            )}
            
            {/* Route Options List */}
            <div className="absolute top-4 left-4 bg-card border border-border rounded-md shadow-md p-2 max-w-xs">
              <div className="text-xs text-muted-foreground mb-2">Click to Select Route</div>
              {data.calculations.map((calc: any, index: number) => {
                const isSelected = selectedRoute === calc.id || (!selectedRoute && index === 0);
                const color = index === 0 ? "bg-green-500" : index === 1 ? "bg-blue-500" : "bg-orange-500";
                
                return (
                  <div
                    key={calc.id}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                    }`}
                    onClick={() => onSelectRoute?.(calc.id)}
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`w-3 h-3 rounded-full ${color}`}></div>
                      <div>
                        <div className="text-xs font-medium">
                          Route {index + 1}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {calc.distance_miles.toFixed(1)} mi
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <div className="text-green-600 text-xs">✓</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
