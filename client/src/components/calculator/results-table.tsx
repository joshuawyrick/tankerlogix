import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Route, 
  ArrowUpDown, 
  FileSpreadsheet,
  CheckCircle,
  ExternalLink,
  Map,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface Props {
  data: any;
  selectedRoute: string | null;
  onSelectRoute: (routeId: string) => void;
  /** Recalculated numbers for a dragged custom route (applies to the selected route), or null */
  customCalc?: any | null;
}


export default function ResultsTable({ data, selectedRoute, onSelectRoute, customCalc }: Props) {
  const [sortField, setSortField] = useState<string>('rate_per_unit');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const { toast } = useToast();

  if (!data || !data.calculations) {
    return null;
  }

  // When the user dragged the route on the map, overlay the recalculated
  // numbers onto the selected route's row (defaults to the first route)
  const effectiveSelectedId = selectedRoute ?? data.calculations[0]?.id;
  const calculations = data.calculations.map((calc: any) =>
    customCalc && calc.id === effectiveSelectedId
      ? {
          ...calc,
          ...customCalc,
          id: calc.id,
          summary: 'Custom (dragged)',
          is_custom: true,
        }
      : calc
  );

  // Export to CSV
  const exportToCSV = () => {
    try {
      const headers = [
        'Route',
        'Distance (mi)',
        'Deadhead (mi)',
        'Total Miles',
        'Drive Time (hr)',
        'Work Time (hr)',
        'Total Time (hr)',
        `$/${data.load_type === 'crude' ? 'Barrel' : 'Gallon'}`,
        '$/Mile',
        'Total Revenue'
      ];

      const rows = calculations.map((calc: any) => [
        calc.summary,
        calc.distance_miles.toFixed(2),
        calc.empty_miles.toFixed(2),
        calc.total_miles.toFixed(2),
        calc.drive_time_hr.toFixed(2),
        calc.work_time_hr.toFixed(2),
        calc.total_time_hr.toFixed(2),
        calc.rate_per_unit.toFixed(2),
        calc.rate_per_mile_total.toFixed(2),
        calc.required_revenue.toFixed(2)
      ]);

      const csvContent = [
        `Route: ${data.pickup} to ${data.dropoff}`,
        `Load Type: ${data.load_type}`,
        `Units: ${data.units_loaded} ${data.load_type === 'crude' ? 'barrels' : 'gallons'}`,
        '',
        headers.join(','),
        ...rows.map((row: string[]) => row.join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const filename = `rate_${data.pickup.replace(/\s+/g, '_')}_to_${data.dropoff.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export Successful",
        description: `Downloaded ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export CSV. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Export Quote as styled Excel file (same as batch mode)
  const exportQuote = async () => {
    try {
      // Get the selected calculation or the first one if none selected
      // Uses the custom (dragged) numbers when a custom route is active
      const selectedCalc = calculations.find((calc: any) => calc.id === effectiveSelectedId);
      
      if (!selectedCalc) {
        toast({
          title: "No Route Selected",
          description: "Please select a route first to export a quote.",
          variant: "destructive",
        });
        return;
      }

      // Build route data for the selected route
      const routeData = [{
        pickup: data.pickup,
        dropoff: data.dropoff,
        rate: selectedCalc.rate_per_unit,
        oneWayMiles: selectedCalc.distance_miles,
        totalMiles: selectedCalc.total_miles
      }];

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
        description: "Downloaded styled Excel quote.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to generate quote. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedCalculations = [...calculations].sort((a, b) => {
    const aValue = a[sortField];
    const bValue = b[sortField];
    
    if (sortDirection === 'asc') {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
    }
  });

  // Find the lowest rate for highlighting
  const lowestRate = Math.min(...calculations.map((calc: any) => calc.rate_per_unit));

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatTime = (hours: number) => {
    return `${hours.toFixed(1)}h`;
  };

  // Generate Google Maps URL for a single route
  const getRouteMapUrl = (pickup: string, dropoff: string, waypoints?: string) => {
    const baseUrl = 'https://www.google.com/maps/dir/';
    const params = new URLSearchParams({
      api: '1',
      origin: pickup,
      destination: dropoff,
      travelmode: 'driving'
    });
    
    if (waypoints) {
      params.append('waypoints', waypoints);
    }
    
    return `${baseUrl}?${params.toString()}`;
  };

  // Generate Google Maps URL showing all routes
  const getAllRoutesMapUrl = () => {
    if (!data.pickup || !data.dropoff) return '#';
    return getRouteMapUrl(data.pickup, data.dropoff);
  };

  return (
    <Card className="card-metallic">
      <CardHeader>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center text-base">
              <Route className="w-4 h-4 text-primary mr-2" />
              Route Options & Pricing
            </CardTitle>
            <div className="flex flex-wrap gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open(getAllRoutesMapUrl(), '_blank')}
                data-testid="button-view-all-routes"
                className="h-8 px-2 text-xs"
              >
                <Map className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">View in Maps</span>
                <span className="sm:hidden">Maps</span>
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={exportToCSV}
                data-testid="button-export-csv" 
                className="h-8 px-2 text-xs"
              >
                <FileSpreadsheet className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Export CSV</span>
                <span className="sm:hidden">CSV</span>
              </Button>
              <Button 
                variant="default" 
                size="sm" 
                onClick={exportQuote}
                data-testid="button-export-quote" 
                className="h-8 px-2 text-xs bg-green-600 hover:bg-green-700"
              >
                <Download className="w-3 h-3 mr-1" />
                <span className="hidden sm:inline">Export Quote</span>
                <span className="sm:hidden">Quote</span>
              </Button>
            </div>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">
              {data.pickup} → {data.dropoff} ({data.units_loaded} {data.load_type === 'crude' ? 'barrels' : 'gallons'})
            </p>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-border shadow-metallic-sm">
            <thead className="bg-gradient-chrome/40 shadow-metallic-sm">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('summary')}
                    data-testid="sort-route"
                  >
                    Route
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('total_miles')}
                    data-testid="sort-distance"
                  >
                    Distance
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('total_time_hr')}
                    data-testid="sort-time"
                  >
                    Total Time
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('rate_per_unit')}
                    data-testid="sort-rate"
                  >
                    $/{data.load_type === 'crude' ? 'Barrel' : 'Gallon'}
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('rate_per_mile_total')}
                    data-testid="sort-mile-rate"
                  >
                    $/Mile (Total)
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <button 
                    className="flex items-center hover:text-foreground"
                    onClick={() => handleSort('required_revenue')}
                    data-testid="sort-revenue"
                  >
                    Total Revenue
                    <ArrowUpDown className="w-3 h-3 ml-1" />
                  </button>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-card divide-y divide-border">
              {sortedCalculations.map((calc: any, index: number) => {
                const isSelected = selectedRoute === calc.id;
                const isLowestRate = Math.abs(calc.rate_per_unit - lowestRate) < 0.01;
                
                return (
                  <tr
                    key={calc.id}
                    className={cn(
                      "hover:bg-muted/50 cursor-pointer transition-colors",
                      isSelected && "bg-green-50 border-l-4 border-l-green-500",
                      isLowestRate && !isSelected && "bg-green-50/50"
                    )}
                    onClick={() => onSelectRoute(calc.id)}
                    data-testid={`route-row-${index}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className={cn(
                          "flex-shrink-0 h-3 w-3 rounded-full mr-3",
                          index === 0 ? "bg-green-500" : 
                          index === 1 ? "bg-blue-500" : "bg-orange-500"
                        )} />
                        <div>
                          <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            {calc.summary}
                            {calc.is_custom && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0" data-testid="badge-customized">
                                Customized
                              </Badge>
                            )}
                          </div>
                          {isLowestRate && (
                            <div className="flex items-center text-sm text-green-600">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Lowest rate
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {calc.distance_miles.toFixed(1)} mi
                      </div>
                      {calc.base_to_pickup_miles > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Yard→Pickup: {calc.base_to_pickup_miles.toFixed(1)} mi
                        </div>
                      )}
                      {calc.dropoff_to_base_miles > 0 && (
                        <div className="text-sm text-muted-foreground">
                          Dropoff→Yard: {calc.dropoff_to_base_miles.toFixed(1)} mi
                        </div>
                      )}
                      {calc.empty_miles > 0 && !calc.base_to_pickup_miles && !calc.dropoff_to_base_miles && (
                        <div className="text-sm text-muted-foreground">
                          +return: {calc.empty_miles.toFixed(1)} mi
                        </div>
                      )}
                      {calc.empty_miles > 0 && (
                        <div className="text-sm font-medium text-foreground border-t border-gray-200 pt-1 mt-1">
                          Total: {calc.total_miles.toFixed(1)} mi
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-foreground">
                        {formatTime(calc.total_time_hr)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Drive: {formatTime(calc.drive_time_hr)} + Work: {formatTime(calc.work_time_hr)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={cn(
                        "text-lg font-semibold",
                        isLowestRate ? "text-green-600" : "text-foreground"
                      )}>
                        {formatCurrency(calc.rate_per_unit)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                      {formatCurrency(calc.rate_per_mile_total)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground font-medium">
                      {formatCurrency(calc.required_revenue)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => window.open(getRouteMapUrl(data.pickup, data.dropoff), '_blank')}
                          className="h-8 w-8 p-0"
                          data-testid={`button-view-route-${index}`}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                        <Button
                          variant={isSelected ? "default" : "outline"}
                          size="sm"
                          onClick={() => onSelectRoute(calc.id)}
                          data-testid={`button-select-route-${index}`}
                        >
                          {isSelected ? "Selected" : "Select"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
