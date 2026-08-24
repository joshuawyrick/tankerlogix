import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, DollarSign, Clock, Route, Eye, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Shift, ShiftLoad, Location } from "@shared/schema";

export default function ShiftHistory() {
  const { toast } = useToast();
  const [selectedShift, setSelectedShift] = useState<Shift | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisData, setAnalysisData] = useState<any>(null);
  
  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts'],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const deleteShiftMutation = useMutation({
    mutationFn: (shiftId: string) => apiRequest('DELETE', `/api/shifts/${shiftId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: "Shift deleted",
        description: "The shift has been deleted successfully",
      });
      setSelectedShift(null);
      setShowAnalysis(false);
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analyzeShift = async (shift: Shift) => {
    setSelectedShift(shift);
    setShowAnalysis(true);
    
    try {
      // Fetch shift loads
      const loadsResponse = await fetch(`/api/shifts/${shift.shift_id}/loads`);
      if (!loadsResponse.ok) throw new Error('Failed to fetch shift loads');
      const shiftLoads: ShiftLoad[] = await loadsResponse.json();
      
      if (shiftLoads.length === 0) {
        toast({
          title: "No loads found",
          description: "This shift has no loads to analyze",
          variant: "destructive",
        });
        return;
      }

      // Use stored shift data if available, otherwise calculate
      const analysisData = {
        total_revenue: shift.total_revenue,
        total_miles: shift.total_miles,
        total_work_time_hours: shift.total_work_time_hours,
        total_drive_time_hours: shift.total_drive_time_hours,
        effective_hourly_rate: shift.effective_hourly_rate,
        deadhead_start_miles: shift.deadhead_start_miles,
        deadhead_return_miles: shift.deadhead_return_miles,
        loads: shiftLoads,
        segment_details: shift.segment_details,
        target_hourly_rate: shift.target_hourly_rate_usd,
        travel_speed_mph: shift.travel_speed_mph,
        traffic_buffer_min: shift.traffic_buffer_min,
      };
      
      setAnalysisData(analysisData);
    } catch (error: any) {
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getLocationName = (locationId?: string) => {
    if (!locationId) return "N/A";
    const location = locations.find(l => l.location_id === locationId);
    return location?.name || locationId;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/50';
      case 'in_progress': return 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/50';
      case 'planned': return 'bg-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/50';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-card-foreground">Shift History</h1>
        <p className="text-muted-foreground">View and analyze your saved shifts</p>
      </div>

      <Card className="card-metallic">
        <CardHeader>
          <CardTitle>Saved Shifts</CardTitle>
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No shifts saved yet. Use the Shift Builder to create your first shift.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Base Yard</TableHead>
                    <TableHead>Revenue</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Rate</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((shift) => (
                    <TableRow key={shift.shift_id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          {new Date(shift.shift_date).toLocaleDateString()}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{shift.name}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(shift.status)}>
                          {shift.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{getLocationName(shift.start_yard_id)}</TableCell>
                      <TableCell>
                        {shift.total_revenue ? (
                          <span className="text-primary font-medium">
                            ${shift.total_revenue.toFixed(2)}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {shift.total_work_time_hours ? (
                          `${shift.total_work_time_hours.toFixed(1)}h`
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        {shift.effective_hourly_rate ? (
                          <span className={shift.effective_hourly_rate >= (shift.target_hourly_rate_usd || 185) ? 'text-primary' : 'text-muted-foreground'}>
                            ${shift.effective_hourly_rate.toFixed(2)}/hr
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => analyzeShift(shift)}
                            data-testid={`button-analyze-${shift.shift_id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive/90"
                            onClick={() => deleteShiftMutation.mutate(shift.shift_id)}
                            data-testid={`button-delete-${shift.shift_id}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Panel */}
      {showAnalysis && selectedShift && analysisData && (
        <Card className="card-metallic">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Shift Analysis: {selectedShift.name}
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAnalysis(false)}
            >
              Close
            </Button>
          </CardHeader>
          <CardContent>
            {/* Configuration Details */}
            <div className="mb-6">
              <h4 className="text-sm font-semibold text-card-foreground mb-3">Shift Configuration</h4>
              <div className="flex gap-6 text-sm text-muted-foreground">
                <div>Target Rate: <span className="text-card-foreground font-medium">${analysisData.target_hourly_rate || 185}/hr</span></div>
                <div>Travel Speed: <span className="text-card-foreground font-medium">{analysisData.travel_speed_mph || 41} mph</span></div>
                {analysisData.traffic_buffer_min > 0 && (
                  <div>Traffic Buffer: <span className="text-card-foreground font-medium">{analysisData.traffic_buffer_min} min</span></div>
                )}
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Revenue</div>
                <div className="text-xl font-bold text-primary">
                  ${analysisData.total_revenue?.toFixed(2) || '0.00'}
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Miles</div>
                <div className="text-xl font-bold text-card-foreground">
                  {analysisData.total_miles?.toFixed(1) || '0.0'} mi
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Work Time</div>
                <div className="text-xl font-bold text-card-foreground">
                  {analysisData.total_work_time_hours?.toFixed(1) || '0.0'} hrs
                  <div className="text-xs text-muted-foreground font-normal">
                    Drive: {analysisData.total_drive_time_hours?.toFixed(1) || '0.0'} hrs
                    <br />Load/Offload: {((analysisData.total_work_time_hours || 0) - (analysisData.total_drive_time_hours || 0)).toFixed(1)} hrs
                  </div>
                </div>
              </div>
              
              <div className="card-metallic p-4">
                <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Effective Rate</div>
                <div className={`text-xl font-bold ${
                  analysisData.effective_hourly_rate >= (selectedShift.target_hourly_rate_usd || 185) ? 'text-primary' : 'text-destructive'
                }`}>
                  ${analysisData.effective_hourly_rate?.toFixed(2) || '0.00'}/hr
                  <div className="text-xs text-muted-foreground font-normal">
                    Target: ${analysisData.target_hourly_rate || 185}/hr
                  </div>
                </div>
              </div>
            </div>

            {/* Route Segments */}
            {analysisData.segment_details && Array.isArray(analysisData.segment_details) && (
              <div className="mb-6">
                <h4 className="text-sm font-semibold text-card-foreground mb-3">Route Segments</h4>
                <div className="space-y-2">
                  {analysisData.segment_details.map((segment: any, index: number) => {
                    let segmentLabel = '';
                    if (segment.segment_type === 'base_to_pickup') {
                      segmentLabel = '🏠 Yard to first pickup';
                    } else if (segment.segment_type === 'pickup_to_dropoff') {
                      segmentLabel = `🔵 Load ${(segment.load_index || 0) + 1}`;
                    } else if (segment.segment_type === 'dropoff_to_pickup') {
                      segmentLabel = `🔴→🔵 Between loads`;
                    } else if (segment.segment_type === 'dropoff_to_base') {
                      segmentLabel = '🔴→🏠 Last drop to yard';
                    }
                    
                    const durationMin = (segment.duration_hours || 0) * 60;
                    const hours = Math.floor(durationMin / 60);
                    const minutes = Math.round(durationMin % 60);
                    
                    return (
                      <div key={index} className="flex justify-between items-center p-2 bg-muted/20 rounded text-sm">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{segmentLabel}</span>
                          <span className="text-muted-foreground">
                            {segment.from_location_name || 'Unknown'} → {segment.to_location_name || 'Unknown'}
                          </span>
                        </div>
                        <div className="flex gap-3 text-muted-foreground">
                          <span>{segment.distance_miles?.toFixed(1) || '0'} mi</span>
                          <span>{hours}h {minutes}m</span>
                          <span className="text-xs">@ {analysisData.travel_speed_mph || 41} mph</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Load Details */}
            {analysisData.loads && analysisData.loads.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-card-foreground mb-3">Load Details</h4>
                <div className="space-y-2">
                  {analysisData.loads.map((load: ShiftLoad) => (
                    <div key={load.load_id} className="flex justify-between items-center p-3 bg-muted/30 rounded">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">Load {load.load_order}</Badge>
                        <span className="text-sm">
                          {load.pickup_location_name || getLocationName(load.pickup_location_id)} → {load.dropoff_location_name || getLocationName(load.dropoff_location_id)}
                        </span>
                        {load.customer_id && (
                          <Badge variant="secondary" className="text-xs">Customer</Badge>
                        )}
                      </div>
                      <div className="flex gap-4 text-sm text-muted-foreground">
                        <span>{load.product_type === 'crude' ? '🛢️' : '⛽'} {load.volume} {load.product_type === 'crude' ? 'bbl' : 'gal'}</span>
                        <span>{load.total_miles?.toFixed(1) || '0'} mi</span>
                        <span>${(load.volume * load.rate_per_unit).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deadhead Analysis */}
            {(analysisData.deadhead_start_miles !== undefined || analysisData.deadhead_return_miles !== undefined) && (
              <div className="mt-6">
                <h4 className="text-sm font-semibold text-card-foreground mb-3">Deadhead Analysis</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-muted/30 rounded">
                    <div className="text-xs text-muted-foreground">Start Deadhead</div>
                    <div className="font-medium">
                      {analysisData.deadhead_start_miles?.toFixed(1) || '0'} mi
                      {analysisData.deadhead_start_miles > 0 && analysisData.travel_speed_mph && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((analysisData.deadhead_start_miles / analysisData.travel_speed_mph) * 60)}m)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="p-3 bg-muted/30 rounded">
                    <div className="text-xs text-muted-foreground">Return Deadhead</div>
                    <div className="font-medium">
                      {analysisData.deadhead_return_miles?.toFixed(1) || '0'} mi
                      {analysisData.deadhead_return_miles > 0 && analysisData.travel_speed_mph && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({Math.round((analysisData.deadhead_return_miles / analysisData.travel_speed_mph) * 60)}m)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}