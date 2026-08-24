import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calendar, Plus, Edit, Trash2, Save, X, AlertTriangle, Clock, Route, DollarSign, Package } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Shift, ShiftLoad, InsertShift, InsertShiftLoad, ContractedRoute, Location, RouteTemplate, Config } from "@shared/schema";
import { insertShiftSchema, insertShiftLoadSchema } from "@shared/schema";
import { RouteTemplatesManager } from "./route-templates";

// LoadsCell component for displaying and managing shift loads
interface LoadsCellProps {
  shift: Shift;
  onManageLoads: (shift: Shift) => void;
}

function LoadsCell({ shift, onManageLoads }: LoadsCellProps) {
  const { data: shiftLoads = [] } = useQuery<ShiftLoad[]>({
    queryKey: ['/api/shifts', shift.shift_id, 'loads'],
    queryFn: async () => {
      const response = await fetch(`/api/shifts/${shift.shift_id}/loads`);
      if (!response.ok) throw new Error('Failed to fetch shift loads');
      return response.json();
    },
  });

  const loadCount = shiftLoads.length;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1">
        <Route className="w-4 h-4 text-muted-foreground" />
        <span data-testid={`text-load-count-${shift.shift_id}`}>{loadCount}/5</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onManageLoads(shift)}
        className="h-6 px-2 text-xs"
        data-testid={`button-manage-loads-${shift.shift_id}`}
      >
        <Package className="w-3 h-3 mr-1" />
        Manage
      </Button>
    </div>
  );
}

// LoadsList component for displaying existing loads in the shift
interface LoadsListProps {
  shift: Shift;
}

function LoadsList({ shift }: LoadsListProps) {
  const { data: shiftLoads = [], isLoading } = useQuery<ShiftLoad[]>({
    queryKey: ['/api/shifts', shift.shift_id, 'loads'],
    queryFn: async () => {
      const response = await fetch(`/api/shifts/${shift.shift_id}/loads`);
      if (!response.ok) throw new Error('Failed to fetch shift loads');
      return response.json();
    },
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  });

  const { data: routeTemplates = [] } = useQuery<RouteTemplate[]>({
    queryKey: ['/api/route-templates'],
  });

  const deleteLoadMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/shift-loads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', shift.shift_id, 'loads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
    },
  });

  const updateLoadMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<InsertShiftLoad> }) => 
      apiRequest('PUT', `/api/shift-loads/${data.id}`, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts', shift.shift_id, 'loads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
    },
  });

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.location_id === locationId);
    return location?.name || locationId;
  };

  if (isLoading) return <div className="text-center py-4">Loading loads...</div>;

  if (shiftLoads.length === 0) {
    return (
      <div className="card-metallic p-4">
        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Current Loads</h3>
        <div className="text-center py-8 text-muted-foreground">
          No loads added to this shift yet.
        </div>
      </div>
    );
  }

  return (
    <div className="card-metallic p-4">
      <h3 className="text-lg font-semibold mb-4 text-card-foreground">Current Loads ({shiftLoads.length}/5)</h3>
      <div className="space-y-3">
        {shiftLoads.map((load) => (
          <div
            key={load.load_id}
            className="card-metallic p-3"
            data-testid={`load-item-${load.load_id}`}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-2">
                  <Badge variant="outline" className="text-xs">
                    Load #{load.load_order}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {load.product_type.replace('_', ' ').toUpperCase()}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {load.volume} {load.product_type === 'crude' ? 'barrels' : 'gallons'}
                  </span>
                </div>
                <div className="text-sm text-card-foreground">
                  <span className="font-medium">{getLocationName(load.pickup_location_id)}</span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span className="font-medium">{getLocationName(load.dropoff_location_id)}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Rate: ${load.rate_per_unit} {load.rate_type.replace('_', ' ')}
                </div>
                {load.route_template_id && (
                  <div className="text-xs text-primary mt-1">
                    📍 Template: {routeTemplates.find(t => t.template_id === load.route_template_id)?.template_name || 'Unknown'}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteLoadMutation.mutate(load.load_id)}
                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                  data-testid={`button-delete-load-${load.load_id}`}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ShiftAnalysis component for displaying shift calculation results
interface ShiftAnalysisProps {
  shift: Shift;
}

function ShiftAnalysis({ shift }: ShiftAnalysisProps) {
  // Fetch shift loads for this shift
  const { data: shiftLoads = [] } = useQuery<ShiftLoad[]>({
    queryKey: ['/api/shifts', shift.shift_id, 'loads'],
    queryFn: async () => {
      const response = await fetch(`/api/shifts/${shift.shift_id}/loads`);
      if (!response.ok) throw new Error('Failed to fetch shift loads');
      return response.json();
    },
  });

  // Fetch locations to get base yard name
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  });
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Automatically calculate when loads change
  useEffect(() => {
    if (shiftLoads.length === 0) {
      setAnalysisData(null);
      return;
    }

    const calculateShift = async () => {
      setIsCalculating(true);
      setError(null);
      
      try {
        // Transform shift loads to calculation format
        const loads = shiftLoads.map(load => ({
          load_order: load.load_order,
          pickup_location_id: load.pickup_location_id,
          dropoff_location_id: load.dropoff_location_id,
          product_type: load.product_type,
          volume: load.volume,
          rate_per_unit: load.rate_per_unit,
          rate_type: load.rate_type,
          pickup_time_min: load.pickup_time_min,
          dropoff_time_min: load.dropoff_time_min,
          avg_speed: load.avg_speed,
          notes: load.notes || ""
        }));

        const calculationRequest = {
          shift_id: shift.shift_id,
          loads,
          include_deadhead: true,
          deadhead_type: "portaltoportal" as const,
          base_yard_id: shift.start_yard_id || shift.end_yard_id
        };

        const response = await fetch('/api/shifts/calculate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calculationRequest),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Calculation failed');
        }

        const data = await response.json();
        setAnalysisData(data);
      } catch (err: any) {
        setError(err.message);
        setAnalysisData(null);
      } finally {
        setIsCalculating(false);
      }
    };

    calculateShift();
  }, [shiftLoads, shift.shift_id, shift.start_yard_id, shift.end_yard_id]);

  if (shiftLoads.length === 0) {
    return null;
  }

  if (isCalculating) {
    return (
      <div className="card-metallic p-4">
        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Shift Analysis</h3>
        <div className="text-center py-8 text-muted-foreground">
          <div className="inline-flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            Calculating shift metrics...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card-metallic p-4">
        <h3 className="text-lg font-semibold mb-4 text-card-foreground">Shift Analysis</h3>
        <div className="bg-destructive/10 border border-destructive p-4 radius-site">
          <div className="text-destructive text-sm">
            <strong>Calculation Error:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  if (!analysisData) {
    return null;
  }

  const targetRate = shift.target_hourly_rate_usd || 135;
  const effectiveRate = analysisData.effective_hourly_rate || 0;
  const meetsTarget = effectiveRate >= targetRate;
  const targetDifference = effectiveRate - targetRate;
  
  // Get base yard names
  const startYard = locations.find(l => l.location_id === shift.start_yard_id);
  const endYard = locations.find(l => l.location_id === shift.end_yard_id);
  const baseYardName = startYard?.name || endYard?.name || 'Base Yard';

  return (
    <div className="card-metallic p-4">
      <h3 className="text-lg font-semibold mb-4 text-card-foreground">Shift Analysis</h3>
      
      {/* Overall Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card-metallic p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Revenue</div>
          <div className="text-xl font-bold text-primary">
            ${analysisData.total_revenue?.toFixed(2) || '0.00'}
          </div>
        </div>
        
        <div className="card-metallic p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total Work Time</div>
          <div className="text-xl font-bold text-card-foreground">
            {analysisData.total_work_time_hours?.toFixed(1) || '0.0'}h
          </div>
          <div className="text-xs text-muted-foreground">
            ({analysisData.total_drive_time_hours?.toFixed(1) || '0.0'}h driving)
          </div>
        </div>
        
        <div className="card-metallic p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Effective Rate</div>
          <div className={`text-xl font-bold ${meetsTarget ? 'text-primary' : 'text-destructive'}`}>
            ${effectiveRate.toFixed(2)}/hr
          </div>
          <div className={`text-xs font-medium ${meetsTarget ? 'text-primary' : 'text-destructive'}`}>
            {meetsTarget ? '+' : ''}${targetDifference.toFixed(2)} vs target
          </div>
        </div>
      </div>

      {/* Target Comparison */}
      <div className={`card-metallic p-4 mb-4 border-2 ${meetsTarget ? 'border-primary' : 'border-destructive'}`}>
        <div className="flex items-center gap-3">
          {meetsTarget ? (
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-bold">✓</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-destructive flex items-center justify-center">
              <span className="text-destructive-foreground text-sm font-bold">✗</span>
            </div>
          )}
          <div>
            <div className={`font-bold text-lg ${meetsTarget ? 'text-primary' : 'text-destructive'}`}>
              {meetsTarget ? 'Target Achieved' : 'Below Target'}
            </div>
            <div className="text-sm text-muted-foreground font-medium">
              Target: ${targetRate}/hr • Actual: ${effectiveRate.toFixed(2)}/hr
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Breakdown */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-muted-foreground">Complete Route Journey</h4>
        
        {/* Base Yard to First Pickup */}
        {analysisData.deadhead_start_miles > 0 && analysisData.load_calculations?.length > 0 && (
          <div className="card-metallic p-3 border-l-4 border-accent">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-card-foreground flex items-center gap-2">
                  <span className="text-accent">🏭</span>
                  {baseYardName} → {analysisData.load_calculations[0].pickup_location}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Deadhead Start • {analysisData.deadhead_start_miles?.toFixed(1)}mi • {(analysisData.deadhead_start_hours * 60)?.toFixed(0)}min
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Non-Revenue
                </div>
              </div>
            </div>
          </div>
        )}
        {analysisData.load_calculations?.map((load: any, index: number) => (
          <div key={`segment-${index}`}>
            {/* Load Segment */}
            <div className="card-metallic p-3 border-l-4 border-primary">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-sm font-bold text-card-foreground flex items-center gap-2">
                    <span className="text-primary">📦</span>
                    Load #{load.load_order}: {load.pickup_location} → {load.dropoff_location}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Revenue Load • {load.distance_miles?.toFixed(1)}mi • Drive: {(load.drive_time_hours * 60)?.toFixed(0)}min
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Pickup: {load.pickup_time_min || 60}min • Dropoff: {load.dropoff_time_min || 60}min • Total: {(load.work_time_hours * 60)?.toFixed(0)}min
                  </div>
                  <div className="text-xs text-primary mt-1 font-medium">
                    Revenue: ${load.revenue?.toFixed(2)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-primary">
                    ${(load.revenue / load.work_time_hours)?.toFixed(2)}/hr
                  </div>
                </div>
              </div>
            </div>
            
            {/* Transition to Next Load */}
            {index < analysisData.load_calculations.length - 1 && (
              <div className="card-metallic p-3 border-l-4 border-muted ml-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <span>➜</span>
                      {load.dropoff_location} → {analysisData.load_calculations[index + 1].pickup_location}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Transition • Distance varies by route
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Return to Base Yard */}
        {analysisData.deadhead_return_miles > 0 && analysisData.load_calculations?.length > 0 && (
          <div className="card-metallic p-3 border-l-4 border-accent">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-sm font-bold text-card-foreground flex items-center gap-2">
                  <span className="text-accent">🏭</span>
                  {analysisData.load_calculations[analysisData.load_calculations.length - 1].dropoff_location} → {baseYardName}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Deadhead Return • {analysisData.deadhead_return_miles?.toFixed(1)}mi • {(analysisData.deadhead_return_hours * 60)?.toFixed(0)}min
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground">
                  Non-Revenue
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Total Deadhead Summary */}
        {analysisData.deadhead_miles > 0 && (
          <div className="card-metallic p-3 bg-accent/10 border-2 border-accent">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-bold text-accent-foreground">Total Deadhead (Start + Return)</div>
                <div className="text-xs text-muted-foreground">
                  {analysisData.deadhead_miles?.toFixed(1)}mi • {(analysisData.deadhead_hours * 60)?.toFixed(0)}min • ${0.00} revenue
                </div>
              </div>
              <div className="text-sm font-bold text-accent-foreground">
                ${0.00}/hr
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-muted-foreground font-medium">Total Miles</div>
            <div className="text-sm font-bold text-card-foreground">
              {analysisData.total_miles?.toFixed(1) || '0.0'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Avg Revenue/Load</div>
            <div className="text-sm font-bold text-card-foreground">
              ${analysisData.summary?.avg_revenue_per_load?.toFixed(2) || '0.00'}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground font-medium">Loads</div>
            <div className="text-sm font-bold text-card-foreground">
              {analysisData.summary?.loads_count || 0}/5
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ShiftPlanner() {
  const [activeTab, setActiveTab] = useState("shifts");
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [editForm, setEditForm] = useState<Partial<Shift>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  // Form for adding shifts
  const addForm = useForm<InsertShift>({
    resolver: zodResolver(insertShiftSchema),
    defaultValues: {
      shift_date: new Date().toISOString().split('T')[0],
      status: "planned",
      name: "",
      notes: "",
      start_yard_id: undefined,
      end_yard_id: undefined,
    },
  });
  const [selectedShifts, setSelectedShifts] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  
  // Load management state
  const [loadManagementShift, setLoadManagementShift] = useState<Shift | null>(null);
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [editingLoad, setEditingLoad] = useState<ShiftLoad | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");

  const { data: shifts = [], isLoading } = useQuery<Shift[]>({
    queryKey: ['/api/shifts'],
  });

  // Queries for locations and contracted routes for load management
  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  });

  const { data: contractedRoutes = [] } = useQuery<ContractedRoute[]>({
    queryKey: ['/api/contracted-routes'],
  });

  const { data: routeTemplates = [] } = useQuery<RouteTemplate[]>({
    queryKey: ['/api/route-templates'],
  });

  const { data: config } = useQuery<Config>({
    queryKey: ['/api/config'],
  });

  // Form for adding/editing loads
  const loadForm = useForm<InsertShiftLoad>({
    resolver: zodResolver(insertShiftLoadSchema),
    defaultValues: {
      load_order: 1,
      product_type: "crude",
      rate_type: "per_barrel",
      pickup_time_min: 60, // Will be updated by config
      dropoff_time_min: 60, // Will be updated by config  
      avg_speed: 41, // Will be updated by config
      route_template_id: undefined,
    },
  });

  // Apply config defaults when loaded
  useEffect(() => {
    if (config && !editingLoad) {
      loadForm.reset({
        ...loadForm.getValues(),
        pickup_time_min: config.pickup_time_min_default,
        dropoff_time_min: config.dropoff_time_min_default,
        avg_speed: config.avg_mph_default,
      });
    }
  }, [config]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/shifts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      toast({
        title: "Shift Deleted",
        description: "Shift has been successfully removed.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; updates: Partial<Shift> }) => 
      apiRequest('PUT', `/api/shifts/${data.id}`, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setEditingShift(null);
      setEditForm({});
      toast({
        title: "Shift Updated",
        description: "Shift has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: (data: InsertShift) => apiRequest('POST', '/api/shifts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setAddDialogOpen(false);
      addForm.reset({
        shift_date: new Date().toISOString().split('T')[0],
        status: "planned",
        name: "",
        notes: "",
      });
      toast({
        title: "Shift Created",
        description: "New shift has been successfully created.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: string[]) => apiRequest('DELETE', '/api/shifts/bulk', { ids }),
    onSuccess: (_, deletedIds) => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      setSelectedShifts(new Set());
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Shifts Deleted",
        description: `Successfully deleted ${deletedIds.length} shift(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk Delete Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Load management mutations
  const addLoadMutation = useMutation({
    mutationFn: (data: InsertShiftLoad) => apiRequest('POST', '/api/shift-loads', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      shifts.forEach(shift => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts', shift.shift_id, 'loads'] });
      });
      setLoadDialogOpen(false);
      loadForm.reset({
        load_order: 1,
        product_type: "crude",
        rate_type: "per_barrel",
        pickup_time_min: 60,
        dropoff_time_min: 60,
        avg_speed: 41,
      });
      toast({
        title: "Load Added",
        description: "Load has been successfully added to the shift.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Load",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteLoadMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/shift-loads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shifts'] });
      shifts.forEach(shift => {
        queryClient.invalidateQueries({ queryKey: ['/api/shifts', shift.shift_id, 'loads'] });
      });
      toast({
        title: "Load Deleted",
        description: "Load has been successfully deleted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Delete Load",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Helper function to get shift loads count for each shift
  const useShiftLoadsCount = (shiftId: string) => {
    const { data: shiftLoads = [] } = useQuery<ShiftLoad[]>({
      queryKey: ['/api/shifts', shiftId, 'loads'],
      queryFn: async () => {
        const response = await fetch(`/api/shifts/${shiftId}/loads`);
        if (!response.ok) throw new Error('Failed to fetch shift loads');
        return response.json();
      },
    });
    return shiftLoads.length;
  };

  const filteredShifts = shifts.filter(shift =>
    shift.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shift.notes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    shift.shift_date.includes(searchTerm)
  );

  const handleSelectShift = (shiftId: string) => {
    const newSelected = new Set(selectedShifts);
    if (newSelected.has(shiftId)) {
      newSelected.delete(shiftId);
    } else {
      newSelected.add(shiftId);
    }
    setSelectedShifts(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedShifts.size === filteredShifts.length) {
      setSelectedShifts(new Set());
    } else {
      setSelectedShifts(new Set(filteredShifts.map(s => s.shift_id)));
    }
  };

  const startEdit = (shift: Shift) => {
    setEditingShift(shift);
    setEditForm({ ...shift });
  };

  const getLocationName = (locationId: string) => {
    const location = locations.find(l => l.location_id === locationId);
    return location?.name || 'Unknown';
  };

  const cancelEdit = () => {
    setEditingShift(null);
    setEditForm({});
  };

  const saveEdit = () => {
    if (editingShift && Object.keys(editForm).length > 0) {
      updateMutation.mutate({ id: editingShift.shift_id, updates: editForm });
    }
  };

  const addShift = (data: InsertShift) => {
    addMutation.mutate(data);
  };

  // Load management functions
  const openLoadManager = async (shift: Shift) => {
    setLoadManagementShift(shift);
    setLoadDialogOpen(true);
    setSelectedTemplate(""); // Reset template selection
    loadForm.setValue('shift_id', shift.shift_id);
    
    // Auto-assign next load order by fetching existing loads
    try {
      const response = await fetch(`/api/shifts/${shift.shift_id}/loads`);
      if (response.ok) {
        const existingLoads: ShiftLoad[] = await response.json();
        const nextOrder = existingLoads.length > 0 ? Math.max(...existingLoads.map(l => l.load_order)) + 1 : 1;
        loadForm.setValue('load_order', Math.min(nextOrder, 5));
      } else {
        loadForm.setValue('load_order', 1);
      }
    } catch (error) {
      loadForm.setValue('load_order', 1);
    }
  };

  const addLoad = (data: InsertShiftLoad) => {
    addLoadMutation.mutate(data);
  };


  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'planned': return 'bg-blue-500/20 text-blue-300 border-blue-500/50';
      case 'in_progress': return 'bg-amber-500/20 text-amber-300 border-amber-500/50';
      case 'completed': return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50';
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
        <h1 className="text-3xl font-bold text-card-foreground">Shift Planner</h1>
        <p className="text-muted-foreground">Plan and optimize your daily shifts with multi-load management</p>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="shifts">Shifts</TabsTrigger>
          <TabsTrigger value="templates">Route Templates</TabsTrigger>
        </TabsList>
        
        <TabsContent value="shifts" className="space-y-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gold">
            Shift Planner
          </h1>
          <p className="text-muted-foreground mt-1">Plan and manage complete shifts with multiple loads</p>
        </div>
        <div className="flex gap-2">
          {selectedShifts.size > 0 && (
            <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" data-testid="button-bulk-delete">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete ({selectedShifts.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Selected Shifts</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete {selectedShifts.size} selected shift(s)? This action cannot be undone and will also delete all associated shift loads.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => bulkDeleteMutation.mutate(Array.from(selectedShifts))}
                    className="bg-red-600 hover:bg-red-700"
                    data-testid="button-confirm-bulk-delete"
                  >
                    Delete Shifts
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700" data-testid="button-add-shift">
                <Plus className="w-4 h-4 mr-2" />
                New Shift
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Shift</DialogTitle>
              </DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(addShift)} className="space-y-4">
                  <FormField
                    control={addForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Shift Name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g., Morning Run, Evening Haul"
                            data-testid="input-shift-name"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="shift_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date</FormLabel>
                        <FormControl>
                          <Input
                            type="date"
                            data-testid="input-shift-date"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="target_hourly_rate_usd"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Hourly Rate (USD)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="150.00"
                            data-testid="input-target-hourly"
                            {...field}
                            value={field.value || ""}
                            onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional notes about this shift..."
                            rows={3}
                            data-testid="textarea-notes"
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  {/* Yard Selection Section */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="start_yard_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Yard</FormLabel>
                          <FormControl>
                            <select
                              className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                              data-testid="select-start-yard"
                              {...field}
                              value={field.value || ""}
                            >
                              <option value="">Select start yard...</option>
                              {locations
                                .filter(location => location.role === 'yard' || location.is_base_yard)
                                .map((location) => (
                                  <option key={location.location_id} value={location.location_id}>
                                    {location.name}
                                  </option>
                                ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="end_yard_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>End Yard</FormLabel>
                          <FormControl>
                            <select
                              className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                              data-testid="select-end-yard"
                              {...field}
                              value={field.value || ""}
                            >
                              <option value="">Select end yard...</option>
                              {locations
                                .filter(location => location.role === 'yard' || location.is_base_yard)
                                .map((location) => (
                                  <option key={location.location_id} value={location.location_id}>
                                    {location.name}
                                  </option>
                                ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setAddDialogOpen(false)} data-testid="button-cancel-add">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={addMutation.isPending} data-testid="button-save-shift">
                      {addMutation.isPending ? "Creating..." : "Create Shift"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-2">
            <Input
              placeholder="Search shifts by name, date, or notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
              data-testid="input-search-shifts"
            />
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      {/* Shifts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Shifts ({filteredShifts.length})</span>
            {filteredShifts.length > 0 && (
              <Checkbox
                checked={selectedShifts.size === filteredShifts.length}
                onCheckedChange={handleSelectAll}
                data-testid="checkbox-select-all"
              />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredShifts.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-card-foreground mb-2">No Shifts Found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm ? 'No shifts match your search criteria.' : 'Get started by creating your first shift.'}
              </p>
              {!searchTerm && (
                <Button 
                  onClick={() => setAddDialogOpen(true)}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  data-testid="button-create-first-shift"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Shift
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">Select</TableHead>
                  <TableHead>Shift Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Yard</TableHead>
                  <TableHead>End Yard</TableHead>
                  <TableHead>Loads</TableHead>
                  <TableHead>Target Rate</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredShifts.map((shift) => (
                  <TableRow key={shift.shift_id} data-testid={`row-shift-${shift.shift_id}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedShifts.has(shift.shift_id)}
                        onCheckedChange={() => handleSelectShift(shift.shift_id)}
                        data-testid={`checkbox-shift-${shift.shift_id}`}
                      />
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <Input
                          value={editForm.name || ""}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          className="min-w-32"
                          data-testid={`input-edit-name-${shift.shift_id}`}
                        />
                      ) : (
                        <span className="font-medium text-card-foreground" data-testid={`text-shift-name-${shift.shift_id}`}>
                          {shift.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <Input
                          type="date"
                          value={editForm.shift_date || ""}
                          onChange={(e) => setEditForm({ ...editForm, shift_date: e.target.value })}
                          data-testid={`input-edit-date-${shift.shift_id}`}
                        />
                      ) : (
                        <span data-testid={`text-shift-date-${shift.shift_id}`}>
                          {shift.shift_date}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        className={getStatusBadgeColor(shift.status)}
                        data-testid={`badge-status-${shift.shift_id}`}
                      >
                        {shift.status.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <select
                          value={editForm.start_yard_id || ""}
                          onChange={(e) => setEditForm({ ...editForm, start_yard_id: e.target.value || undefined })}
                          className="w-full px-2 py-1 text-xs bg-input border border-border radius-site"
                          data-testid={`select-edit-start-yard-${shift.shift_id}`}
                        >
                          <option value="">Select start yard...</option>
                          {locations
                            .filter(location => location.role === 'yard' || location.is_base_yard)
                            .map((location) => (
                              <option key={location.location_id} value={location.location_id}>
                                {location.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground" data-testid={`text-start-yard-${shift.shift_id}`}>
                          {shift.start_yard_id ? getLocationName(shift.start_yard_id) : 'Not set'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <select
                          value={editForm.end_yard_id || ""}
                          onChange={(e) => setEditForm({ ...editForm, end_yard_id: e.target.value || undefined })}
                          className="w-full px-2 py-1 text-xs bg-input border border-border radius-site"
                          data-testid={`select-edit-end-yard-${shift.shift_id}`}
                        >
                          <option value="">Select end yard...</option>
                          {locations
                            .filter(location => location.role === 'yard' || location.is_base_yard)
                            .map((location) => (
                              <option key={location.location_id} value={location.location_id}>
                                {location.name}
                              </option>
                            ))}
                        </select>
                      ) : (
                        <span className="text-sm text-muted-foreground" data-testid={`text-end-yard-${shift.shift_id}`}>
                          {shift.end_yard_id ? getLocationName(shift.end_yard_id) : 'Not set'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <LoadsCell shift={shift} onManageLoads={openLoadManager} />
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={editForm.target_hourly_rate_usd || ""}
                          onChange={(e) => setEditForm({ ...editForm, target_hourly_rate_usd: e.target.value ? parseFloat(e.target.value) : undefined })}
                          className="w-24"
                          data-testid={`input-edit-rate-${shift.shift_id}`}
                        />
                      ) : (
                        <div className="flex items-center gap-1">
                          <DollarSign className="w-4 h-4 text-muted-foreground" />
                          <span data-testid={`text-target-rate-${shift.shift_id}`}>
                            {shift.target_hourly_rate_usd ? `$${shift.target_hourly_rate_usd.toFixed(2)}` : 'Not set'}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {editingShift?.shift_id === shift.shift_id ? (
                        <Textarea
                          value={editForm.notes || ""}
                          onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                          className="min-w-32"
                          rows={2}
                          data-testid={`textarea-edit-notes-${shift.shift_id}`}
                        />
                      ) : (
                        <span className="text-sm text-muted-foreground truncate max-w-32 block" data-testid={`text-notes-${shift.shift_id}`}>
                          {shift.notes || 'No notes'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {editingShift?.shift_id === shift.shift_id ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={saveEdit}
                              disabled={updateMutation.isPending}
                              data-testid={`button-save-${shift.shift_id}`}
                            >
                              <Save className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={cancelEdit}
                              data-testid={`button-cancel-${shift.shift_id}`}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => startEdit(shift)}
                              data-testid={`button-edit-${shift.shift_id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  data-testid={`button-delete-${shift.shift_id}`}
                                >
                                  <Trash2 className="w-4 h-4 text-red-400" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Shift</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete "{shift.name}"? This action cannot be undone and will also delete all associated shift loads.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel data-testid={`button-cancel-delete-${shift.shift_id}`}>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(shift.shift_id)}
                                    className="bg-red-600 hover:bg-red-700"
                                    data-testid={`button-confirm-delete-${shift.shift_id}`}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Load Management Dialog */}
      {loadManagementShift && (
        <Dialog open={loadDialogOpen} onOpenChange={setLoadDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Manage Loads for {loadManagementShift.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-6">
              
              {/* Add New Load Form */}
              <div className="card-metallic p-4">
                <h3 className="text-lg font-semibold mb-4 text-card-foreground">Add New Load</h3>
                <Form {...loadForm}>
                  <form onSubmit={loadForm.handleSubmit(addLoad)} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={loadForm.control}
                        name="load_order"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Load Order</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                max="5"
                                data-testid="input-load-order"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="product_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Product Type</FormLabel>
                            <FormControl>
                              <select
                                className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                                data-testid="select-product-type"
                                {...field}
                              >
                                <option value="crude">Crude Oil</option>
                                <option value="diesel">Diesel</option>
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    
                    {/* Template Selection */}
                    <div className="p-4 border border-border radius-site bg-muted/30">
                      <Label className="text-sm font-medium mb-2 block">Apply Route Template (Optional)</Label>
                      <Select 
                        value={selectedTemplate} 
                        onValueChange={(value) => {
                          setSelectedTemplate(value);
                          if (value && value !== "none") {
                            const template = routeTemplates.find(t => t.template_id === value);
                            if (template) {
                              loadForm.setValue("pickup_location_id", template.from_location_id);
                              loadForm.setValue("dropoff_location_id", template.to_location_id);
                              loadForm.setValue("route_template_id", template.template_id);
                              toast({ 
                                title: "Template Applied",
                                description: `Applied route: ${template.template_name}`
                              });
                            }
                          } else if (value === "none") {
                            // Clear template selection
                            loadForm.setValue("pickup_location_id", "");
                            loadForm.setValue("dropoff_location_id", "");
                            loadForm.setValue("route_template_id", undefined);
                          }
                        }}
                      >
                        <SelectTrigger className="w-full" data-testid="select-route-template">
                          <SelectValue placeholder="Select a template to apply" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None - Manual Entry</SelectItem>
                          {routeTemplates
                            .filter(t => t.is_active)
                            .map((template) => {
                              const fromLocation = locations.find(l => l.location_id === template.from_location_id);
                              const toLocation = locations.find(l => l.location_id === template.to_location_id);
                              return (
                                <SelectItem key={template.template_id} value={template.template_id}>
                                  {template.template_name} ({fromLocation?.name} → {toLocation?.name})
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground mt-2">
                        Selecting a template will auto-fill pickup, dropoff, and distance fields
                      </p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={loadForm.control}
                        name="pickup_location_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pickup Location</FormLabel>
                            <FormControl>
                              <select
                                className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                                data-testid="select-pickup-location"
                                {...field}
                              >
                                <option value="">Select pickup location...</option>
                                {locations
                                  .filter(location => location.role === 'pickup' || location.role === 'both')
                                  .map((location) => (
                                    <option key={location.location_id} value={location.location_id}>
                                      {location.name}
                                    </option>
                                  ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="dropoff_location_id"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dropoff Location</FormLabel>
                            <FormControl>
                              <select
                                className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                                data-testid="select-dropoff-location"
                                {...field}
                              >
                                <option value="">Select dropoff location...</option>
                                {locations
                                  .filter(location => location.role === 'dropoff' || location.role === 'both')
                                  .map((location) => (
                                    <option key={location.location_id} value={location.location_id}>
                                      {location.name}
                                    </option>
                                  ))}
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={loadForm.control}
                        name="volume"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Volume</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="130"
                                data-testid="input-volume"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="rate_per_unit"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rate per Unit</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="2.50"
                                data-testid="input-rate-per-unit"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="rate_type"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Rate Type</FormLabel>
                            <FormControl>
                              <select
                                className="w-full px-3 py-2 border border-border bg-input text-foreground radius-site"
                                data-testid="select-rate-type"
                                {...field}
                              >
                                <option value="per_barrel">Per Barrel</option>
                                <option value="per_gallon">Per Gallon</option>
                                <option value="flat_rate">Flat Rate</option>
                              </select>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <FormField
                        control={loadForm.control}
                        name="pickup_time_min"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pickup Time (min)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                placeholder="60"
                                data-testid="input-pickup-time"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="dropoff_time_min"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dropoff Time (min)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                placeholder="60"
                                data-testid="input-dropoff-time"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={loadForm.control}
                        name="avg_speed"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Avg Speed (mph)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="1"
                                step="0.1"
                                placeholder="41"
                                data-testid="input-avg-speed"
                                {...field}
                                onChange={(e) => field.onChange(parseFloat(e.target.value))}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="flex justify-end">
                      <Button 
                        type="submit" 
                        disabled={addLoadMutation.isPending}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                        data-testid="button-add-load"
                      >
                        {addLoadMutation.isPending ? "Adding..." : "Add Load"}
                      </Button>
                    </div>
                  </form>
                </Form>
              </div>
              
              {/* Existing Loads List */}
              <LoadsList shift={loadManagementShift} />
              
              {/* Shift Analysis */}
              <ShiftAnalysis shift={loadManagementShift} />
              
            </div>
          </DialogContent>
        </Dialog>
      )}
        </TabsContent>
        
        <TabsContent value="templates" className="space-y-0">
          <RouteTemplatesManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}