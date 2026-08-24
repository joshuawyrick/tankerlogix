import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  ArrowUpDown, 
  FileSpreadsheet, 
  ExternalLink,
  Check,
  Download
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  data: any;
  selectedPickup?: string | null;
  selectedDropoff?: string | null;
  onSelectRow?: (pickupId: string, dropoffId: string) => void;
  selectedRoute?: number;
  onSelectRoute?: (routeIndex: number) => void;
  /** Recalculated numbers for a dragged custom route on the selected row/route, or null */
  customCalc?: any | null;
}

export default function BatchResultsTable({ data, selectedPickup, selectedDropoff, onSelectRow, selectedRoute = 0, onSelectRoute, customCalc }: Props) {
  const [sortField, setSortField] = useState<string>('shortest_distance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [selectedRoutes, setSelectedRoutes] = useState<Record<string, number>>({});
  const { toast } = useToast();

  if (!data || !data.results) {
    return null;
  }

  // Returns this row's calculations sorted by distance, with the dragged
  // custom route's numbers overlaid on the currently selected row/route
  const getSortedCalcs = (result: any) => {
    const sorted = result.calculations
      ? [...result.calculations].sort((a: any, b: any) => a.distance_miles - b.distance_miles)
      : [];
    if (
      customCalc &&
      result.pickup_location_id === selectedPickup &&
      result.dropoff_location_id === selectedDropoff &&
      sorted[selectedRoute]
    ) {
      sorted[selectedRoute] = {
        ...sorted[selectedRoute],
        ...customCalc,
        route_summary: 'Custom (dragged)',
        is_custom: true,
      };
    }
    return sorted;
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedResults = useMemo(() => {
    return [...data.results].sort((a, b) => {
      let aValue, bValue;

      if (sortField.startsWith('route_')) {
        const routeNum = parseInt(sortField.split('_')[1]) - 1;
        aValue = a.calculations?.[routeNum]?.rate_per_unit || Infinity;
        bValue = b.calculations?.[routeNum]?.rate_per_unit || Infinity;
      } else if (sortField === 'pickup_name') {
        aValue = a.pickup_name || '';
        bValue = b.pickup_name || '';
      } else if (sortField === 'dropoff_name') {
        aValue = a.dropoff_name || '';
        bValue = b.dropoff_name || '';
      } else if (sortField === 'shortest_distance') {
        aValue = Math.min(...(a.calculations?.map((c: any) => c.distance_miles) || [Infinity]));
        bValue = Math.min(...(b.calculations?.map((c: any) => c.distance_miles) || [Infinity]));
      } else if (sortField === 'best_rate') {
        aValue = Math.min(...(a.calculations?.map((c: any) => c.rate_per_unit) || [Infinity]));
        bValue = Math.min(...(b.calculations?.map((c: any) => c.rate_per_unit) || [Infinity]));
      } else {
        aValue = a[sortField];
        bValue = b[sortField];
      }
      
      if (sortDirection === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
  }, [data.results, sortField, sortDirection]);

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const maxRoutes = Math.max(...data.results.map((r: any) => r.calculations?.length || 0));

  // Handle route selection for export - uses compound key for unique selection per row
  const handleRouteSelection = (pickupId: string, dropoffId: string, routeIndex: number) => {
    const compoundKey = `${pickupId}||${dropoffId}`;  // Use || as separator to avoid confusion with underscores in IDs
    setSelectedRoutes(prev => {
      const newSelection = { ...prev };
      if (newSelection[compoundKey] === routeIndex) {
        // Deselect if clicking the same route
        delete newSelection[compoundKey];
      } else {
        // Select the new route
        newSelection[compoundKey] = routeIndex;
      }
      return newSelection;
    });
  };

  // Export to CSV
  const exportToCSV = () => {
    const hasSelectedRoutes = Object.keys(selectedRoutes).length > 0;
    
    // Start with calculation parameters as metadata rows
    const rows = [];
    
    // Add calculation parameters
    rows.push(['CALCULATION PARAMETERS']);
    rows.push(['Parameter', 'Value']);
    rows.push(['Average MPH', data.avg_mph || 'N/A']);
    rows.push(['Pickup Time (min)', data.pickup_time_min || 'N/A']);
    rows.push(['Dropoff Time (min)', data.dropoff_time_min || 'N/A']);
    rows.push(['Traffic Buffer (min)', data.traffic_buffer_min || 'N/A']);
    rows.push(['Target Hourly Rate ($)', data.hourly_target_usd || 'N/A']);
    rows.push(['Load Type', data.load_type === 'crude' ? 'Crude Oil (Barrels)' : 'Diesel (Gallons)']);
    // Format deadhead type for display
    let deadheadDisplay = 'None';
    if (data.include_deadhead) {
      switch(data.deadhead_type) {
        case 'roundtrip': deadheadDisplay = 'Round Trip'; break;
        case 'oneway': deadheadDisplay = 'One-way'; break;
        case 'portaltoportal': deadheadDisplay = 'Portal to Portal (Yard to Yard)'; break;
        default: deadheadDisplay = data.deadhead_type;
      }
    }
    rows.push(['Deadhead Type', deadheadDisplay]);
    // Format batch mode type for display
    let batchModeDisplay = 'Collection';
    if (data.batch_mode_type === 'distribution') {
      batchModeDisplay = 'Distribution (One → Many)';
    } else if (data.batch_mode_type === 'matrix') {
      batchModeDisplay = 'Matrix (Many → Many)';
    } else if (data.batch_mode_type === 'collection') {
      batchModeDisplay = 'Collection (Many → One)';
    }
    rows.push(['Batch Mode', batchModeDisplay]);
    rows.push([]); // Empty row for spacing
    
    // Add main data headers
    rows.push(['ROUTE CALCULATIONS']);
    const headers = ['Pickup Location', 'Dropoff Location', 'Units Loaded'];
    if (hasSelectedRoutes) {
      // Export only selected route
      headers.push(
        'Selected Route',
        'Miles',
        `Rate per ${data.load_type === 'crude' ? 'Barrel' : 'Gallon'}`,
        'Total Revenue'
      );
    } else {
      // Export all routes as before
      for (let i = 1; i <= maxRoutes; i++) {
        headers.push(
          `Route ${i} Summary`,
          `Route ${i} Miles`,
          `Route ${i} Rate per ${data.load_type === 'crude' ? 'Barrel' : 'Gallon'}`,
          `Route ${i} Total Revenue`
        );
      }
    }

    rows.push(headers);
    
    sortedResults.forEach((result: any) => {
      const row = [
        result.pickup_name || 'Unknown', 
        result.dropoff_name || 'Unknown',
        `${result.units_loaded || 'N/A'} ${data.load_type === 'crude' ? 'barrels' : 'gallons'}`
      ];
      
      // Sort routes by distance for this pickup (with custom-route override)
      const sortedCalcs = getSortedCalcs(result);
      
      if (hasSelectedRoutes) {
        // Export only the selected route for this row
        const compoundKey = `${result.pickup_location_id}||${result.dropoff_location_id}`;
        const selectedIndex = selectedRoutes[compoundKey];
        if (selectedIndex !== undefined && sortedCalcs[selectedIndex]) {
          const calc = sortedCalcs[selectedIndex];
          row.push(
            calc.route_summary,
            calc.distance_miles.toFixed(1),
            calc.rate_per_unit.toFixed(2),
            calc.required_revenue.toFixed(2)
          );
        } else {
          row.push('No route selected', '', '', '');
        }
      } else {
        // Export all routes as before
        for (let i = 0; i < maxRoutes; i++) {
          const calc = sortedCalcs[i];
          if (calc) {
            row.push(
              calc.route_summary,
              calc.distance_miles.toFixed(1),
              calc.rate_per_unit.toFixed(2),
              calc.required_revenue.toFixed(2)
            );
          } else {
            row.push('N/A', 'N/A', 'N/A', 'N/A');
          }
        }
      }
      
      rows.push(row);
    });

    const csvContent = rows.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `batch-rates-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    // Use setTimeout to ensure the DOM is ready
    setTimeout(() => {
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);
    }, 0);
  };

  // Export Quote as styled Excel file
  const exportQuoteExcel = async () => {
    const hasSelectedRoutes = Object.keys(selectedRoutes).length > 0;
    
    if (!hasSelectedRoutes) {
      toast({
        title: "No Routes Selected",
        description: "Please select routes by clicking the checkmark on each route you want to include in the quote.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Build route data for selected routes
      const routeData: { pickup: string; dropoff: string; rate: number; oneWayMiles?: number; totalMiles?: number }[] = [];
      
      sortedResults.forEach((result: any) => {
        const compoundKey = `${result.pickup_location_id}||${result.dropoff_location_id}`;
        const selectedIndex = selectedRoutes[compoundKey];
        
        if (selectedIndex !== undefined) {
          const sortedCalcs = getSortedCalcs(result);
          const calc = sortedCalcs[selectedIndex];
          
          if (calc) {
            routeData.push({
              pickup: result.pickup_name || result.pickup_location_id,
              dropoff: result.dropoff_name || result.dropoff_location_id || data.dropoff_name || 'Unknown',
              rate: calc.rate_per_unit,
              oneWayMiles: calc.distance_miles,
              totalMiles: calc.total_miles
            });
          }
        }
      });

      // Call server endpoint to generate styled Excel
      const response = await fetch('/api/export-quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          routes: routeData,
          loadType: data.load_type
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate Excel file');
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `rate-quote-${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, 100);

      toast({
        title: "Quote Exported",
        description: `Downloaded styled Excel quote with ${routeData.length} routes.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export quote. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Generate Google Maps URL using coordinates
  const getRouteMapUrl = (result: any) => {
    // Use coordinates if available, fall back to names
    const origin = result.pickup_lat !== undefined && result.pickup_lon !== undefined
      ? `${result.pickup_lat},${result.pickup_lon}`
      : result.pickup_name || result.pickup_location_id;
    
    const destination = result.dropoff_lat !== undefined && result.dropoff_lon !== undefined
      ? `${result.dropoff_lat},${result.dropoff_lon}`
      : data.dropoff_name;
    
    const params = new URLSearchParams({
      api: '1',
      origin: origin,
      destination: destination,
      travelmode: 'driving'
    });
    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

  return (
    <Card className="card-metallic">
      <CardHeader className="bg-gradient-chrome/30 border-b border-border/50">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="flex items-center">
              <Users className="w-5 h-5 text-primary mr-2" />
              Batch Rate Comparison
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {data.batch_mode_type === 'collection' && `Multiple pickups → ${data.dropoff_name || 'Single dropoff'} (variable units per location)`}
              {data.batch_mode_type === 'distribution' && `${data.pickup_name || 'Single pickup'} → Multiple dropoffs (variable units per location)`}
              {data.batch_mode_type === 'matrix' && 'Multiple pickups → Multiple dropoffs (all combinations)'}
              {!data.batch_mode_type && `Multiple pickups → ${data.dropoff_name || 'Single dropoff'} (variable units per location)`}
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" onClick={exportToCSV} data-testid="button-export-batch-csv">
              <FileSpreadsheet className="w-4 h-4 mr-1" />
              Export CSV{Object.keys(selectedRoutes).length > 0 ? ` (${Object.keys(selectedRoutes).length} selected)` : ''}
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={exportQuoteExcel}
              data-testid="button-export-batch-quote"
              className="bg-green-600 hover:bg-green-700"
            >
              <Download className="w-4 h-4 mr-1" />
              Export Quote{Object.keys(selectedRoutes).length > 0 ? ` (${Object.keys(selectedRoutes).length})` : ''}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="overflow-x-auto w-full">
          <table className="min-w-full divide-y divide-border shadow-metallic-sm">
            <thead className="bg-gradient-chrome/40 shadow-metallic-sm">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('pickup_name')}
                    data-testid="sort-pickup"
                  >
                    Pickup Location
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('dropoff_name')}
                    data-testid="sort-dropoff"
                  >
                    Dropoff Location
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('shortest_distance')}
                    data-testid="sort-shortest-distance"
                  >
                    Shortest Route
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('best_rate')}
                    data-testid="sort-best-rate"
                  >
                    Best Rate
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                {Array.from({ length: maxRoutes }, (_, i) => (
                  <th key={i} className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Route {i + 1}
                    <div className="text-xs font-normal text-muted-foreground">
                      (Sorted: Shortest → Longest)
                    </div>
                  </th>
                ))}
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {sortedResults.map((result: any, index: number) => {
                const isSelected = selectedPickup === result.pickup_location_id && selectedDropoff === result.dropoff_location_id;
                return (
                <tr
                  key={`${result.pickup_location_id}-${result.dropoff_location_id}`}
                  className={cn(
                    "hover:bg-muted/50 transition-colors cursor-pointer",
                    isSelected && "bg-primary/10 border-l-4 border-l-primary"
                  )}
                  onClick={() => onSelectRow?.(result.pickup_location_id, result.dropoff_location_id)}
                  data-testid={`batch-row-${index}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-foreground">
                        {result.pickup_name || result.pickup_location_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {result.units_loaded || 'N/A'} {data.load_type === 'crude' ? 'barrels' : 'gallons'}
                      </div>
                      {result.calculations?.[0]?.base_to_pickup_miles > 0 && (
                        <div className="text-xs text-blue-600">
                          Yard→Pickup: {result.calculations[0].base_to_pickup_miles.toFixed(1)} mi
                        </div>
                      )}
                      {result.error && (
                        <div className="text-sm text-red-600">
                          Error: {result.error}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">
                      {result.dropoff_name || result.dropoff_location_id || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {result.calculations && result.calculations.length > 0 ? (
                      <div>
                        <div className="text-lg font-semibold text-foreground">
                          {Math.min(...result.calculations.map((c: any) => c.distance_miles)).toFixed(1)} mi
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {result.calculations.find((c: any) => 
                            c.distance_miles === Math.min(...result.calculations.map((calc: any) => calc.distance_miles))
                          )?.route_summary || 'Via shortest route'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">N/A</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {result.calculations && result.calculations.length > 0 ? (
                      <div>
                        <div className="text-lg font-semibold text-green-600">
                          {formatCurrency(Math.min(...result.calculations.map((c: any) => c.rate_per_unit)))}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          per {data.load_type === 'crude' ? 'barrel' : 'gallon'}
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-muted-foreground">N/A</div>
                    )}
                  </td>
                  {Array.from({ length: maxRoutes }, (_, i) => {
                    // Sort routes by distance (shortest first) for this pickup,
                    // with the dragged custom route's numbers applied
                    const sortedCalcs = getSortedCalcs(result);
                    const calc = sortedCalcs[i];
                    
                    const isRouteSelected = isSelected && selectedRoute === i;
                    
                    return (
                      <td 
                        key={i} 
                        className={cn(
                          "px-6 py-4 whitespace-nowrap",
                          calc && "cursor-pointer hover:bg-muted/30",
                          isRouteSelected && "bg-primary/5"
                        )}
                        onClick={(e) => {
                          if (calc) {
                            e.stopPropagation();
                            onSelectRow?.(result.pickup_location_id, result.dropoff_location_id);
                            onSelectRoute?.(i);
                          }
                        }}
                      >
                        {calc ? (
                          <div className={cn(
                            "relative",
                            isRouteSelected && "ring-2 ring-primary ring-offset-2 rounded-md p-2"
                          )}>
                            <div className="absolute top-0 right-0">
                              <button
                                className={cn(
                                  "p-1 rounded-md transition-colors",
                                  selectedRoutes[`${result.pickup_location_id}||${result.dropoff_location_id}`] === i
                                    ? "bg-primary text-primary-foreground"
                                    : "hover:bg-muted"
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRouteSelection(result.pickup_location_id, result.dropoff_location_id, i);
                                }}
                                title={selectedRoutes[`${result.pickup_location_id}||${result.dropoff_location_id}`] === i ? "Selected for export" : "Select for export"}
                                data-testid={`select-route-${result.pickup_location_id}-${result.dropoff_location_id}-${i}`}
                              >
                                <Check className={cn(
                                  "h-4 w-4",
                                  selectedRoutes[`${result.pickup_location_id}||${result.dropoff_location_id}`] === i 
                                    ? "opacity-100"
                                    : "opacity-30"
                                )} />
                              </button>
                            </div>
                            <div className="text-lg font-semibold text-foreground pr-8">
                              {formatCurrency(calc.rate_per_unit)}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {calc.distance_miles.toFixed(1)} mi • {calc.route_summary}
                            </div>
                            {calc.is_custom && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-0.5" data-testid="badge-batch-customized">
                                Customized
                              </Badge>
                            )}
                            {calc.total_miles && calc.total_miles !== calc.distance_miles && (
                              <div className="text-sm text-muted-foreground">
                                Total: {calc.total_miles.toFixed(1)} mi (includes deadhead)
                              </div>
                            )}
                            <div className="text-sm text-muted-foreground">
                              Revenue: {formatCurrency(calc.required_revenue)}
                            </div>
                            {calc.drive_time_hr !== undefined && (
                              <div className="text-xs text-muted-foreground mt-1 border-t pt-1">
                                <div>Drive: {(calc.drive_time_hr * 60).toFixed(0)} min</div>
                                <div>Load/Unload: {((calc.total_time_hr - calc.drive_time_hr) * 60).toFixed(0)} min</div>
                                <div>Total: {(calc.total_time_hr * 60).toFixed(0)} min</div>
                                {calc.empty_miles && calc.empty_miles > 0 && (
                                  <div className="text-xs text-yellow-600 dark:text-yellow-500">
                                    Deadhead: {calc.empty_miles.toFixed(1)} mi
                                  </div>
                                )}
                              </div>
                            )}
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 h-auto text-xs text-blue-600 hover:text-blue-800"
                              onClick={(e) => {
                                e.stopPropagation();
                                window.open(getRouteMapUrl(result), '_blank');
                              }}
                              title="Opens in Google Maps - route may vary slightly due to real-time recalculation"
                            >
                              View Route <ExternalLink className="w-3 h-3 ml-1 inline" />
                            </Button>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">N/A</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(getRouteMapUrl(result), '_blank');
                      }}
                      className="h-8 w-8 p-0"
                      data-testid={`button-view-batch-route-${index}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        <div className="px-6 py-4 bg-muted/50 border-t">
          <div className="flex justify-between items-center text-sm">
            <div>
              <span className="font-medium">{data.results.length}</span> pickup locations compared
            </div>
            <div className="flex space-x-4">
              <div>
                Load Type: <Badge variant="outline">{data.load_type === 'crude' ? 'Crude Oil' : 'Diesel'}</Badge>
              </div>
              <div>
                Units: <span className="font-medium">Variable per location</span> (see individual entries)
              </div>
            </div>
          </div>
          {/* Total miles summary */}
          {(() => {
            // Calculate total miles across all shortest routes
            const totalMilesForShortestRoutes = data.results.reduce((sum: number, result: any) => {
              if (result.calculations && result.calculations.length > 0) {
                // Find shortest route for this pickup
                const shortestRoute = result.calculations.reduce((min: any, calc: any) => 
                  calc.distance_miles < min.distance_miles ? calc : min
                );
                return sum + (shortestRoute.total_miles || shortestRoute.distance_miles);
              }
              return sum;
            }, 0);
            
            const totalBaseDistance = data.results.reduce((sum: number, result: any) => {
              if (result.calculations && result.calculations.length > 0) {
                const shortestRoute = result.calculations.reduce((min: any, calc: any) => 
                  calc.distance_miles < min.distance_miles ? calc : min
                );
                return sum + shortestRoute.distance_miles;
              }
              return sum;
            }, 0);
            
            const deadheadMiles = totalMilesForShortestRoutes - totalBaseDistance;
            
            // Format deadhead type for display
            const getDeadheadTypeLabel = () => {
              if (!data.include_deadhead) return 'None';
              switch (data.deadhead_type) {
                case 'roundtrip': return 'Round Trip';
                case 'oneway': return 'One-way';
                case 'portaltoportal': return 'Portal to Portal';
                default: return 'None';
              }
            };
            
            const deadheadTypeLabel = getDeadheadTypeLabel();
            
            return (
              <div className="mt-3 pt-3 border-t flex justify-between items-center">
                <div className="text-sm space-y-1">
                  <div className="font-medium">Total Distance Summary (Shortest Routes)</div>
                  <div className="text-muted-foreground">
                    Base Distance: <span className="font-medium">{totalBaseDistance.toFixed(1)} mi</span>
                  </div>
                  {deadheadMiles > 0 && (
                    <div className="text-muted-foreground">
                      Deadhead Miles ({deadheadTypeLabel}): <span className="font-medium text-yellow-600 dark:text-yellow-500">{deadheadMiles.toFixed(1)} mi</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-primary">
                    {totalMilesForShortestRoutes.toFixed(1)} mi
                  </div>
                  <div className="text-xs text-muted-foreground">Total Miles Driven</div>
                </div>
              </div>
            );
          })()}
          {/* End total miles summary */}
          <div className="mt-2 text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-medium">Route Selection:</span> Click the ✓ icon on any route to select it for export. When routes are selected, only those will be exported to CSV. If no routes are selected, all routes will be exported.
            </div>
            <div>
              <span className="font-medium">Note:</span> "View Route" links open in Google Maps which may show slightly different distances due to real-time route recalculation. The rates shown here are based on the exact routes calculated at the time of analysis.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}