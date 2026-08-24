import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MapPin, Plus, Edit, Trash2, Save, X, AlertTriangle, MapPinOff, Download, Upload, Loader2, Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Location } from "@shared/schema";
import { getLocationIssues, hasLocationIssues, hasValidCoordinates, isWithinOperatingRegion, type LocationIssue } from "@shared/location-validation";
import FileUploader from "@/components/upload/file-uploader";
import { PinVerificationModal, usePinVerification } from "@/components/pin-verification-modal";
import MapPinPicker from "@/components/locations/map-pin-picker";

interface BulkFixProposal {
  id: string;
  name: string;
  oldLat: number | null;
  oldLon: number | null;
  issue: 'missing' | 'out_of_region';
  status: 'ok' | 'error';
  lat?: number;
  lon?: number;
  formatted_address?: string;
  stillOutOfRegion?: boolean;
  error?: string;
  selected: boolean;
}

export default function Locations() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [showOnlyFlagged, setShowOnlyFlagged] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [editForm, setEditForm] = useState<Partial<Location>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<Location>>({});
  const [selectedLocations, setSelectedLocations] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteType, setBulkDeleteType] = useState<'selected' | 'pickup' | 'dropoff' | 'both' | 'yard' | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [geocodeOpenId, setGeocodeOpenId] = useState<string | null>(null);
  const [geocodeAddress, setGeocodeAddress] = useState("");
  const [pinnedCoords, setPinnedCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [loadSizeDrafts, setLoadSizeDrafts] = useState<Record<string, string>>({});
  const [bulkFixOpen, setBulkFixOpen] = useState(false);
  const [bulkFixLoading, setBulkFixLoading] = useState(false);
  const [bulkFixApplying, setBulkFixApplying] = useState(false);
  const [bulkFixProposals, setBulkFixProposals] = useState<BulkFixProposal[]>([]);
  const { showModal, setShowModal, verifyAndExecute, handleVerified } = usePinVerification();

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/locations/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      toast({
        title: "Location Deleted",
        description: "Location has been successfully removed.",
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
    mutationFn: async (data: { id: string; updates: Partial<Location> }) => {
      const response = await apiRequest('PUT', `/api/locations/${data.id}`, data.updates);
      return await response.json() as Location & { warnings?: LocationIssue[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setEditingLocation(null);
      setEditForm({});
      const warnings = data.warnings ?? [];
      if (warnings.length > 0) {
        toast({
          title: "Saved With Warnings",
          description: warnings.map(w => w.message).join(' '),
        });
      } else {
        toast({
          title: "Location Updated",
          description: "Location has been updated successfully.",
        });
      }
    },
    onError: (error: any) => {
      const message = String(error?.message ?? '');
      if (message.startsWith('404')) {
        // The record was deleted (e.g. in another tab) before this save landed.
        queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
        setEditingLocation(null);
        setEditForm({});
        toast({
          title: "Location No Longer Exists",
          description: "This location was removed, so your changes couldn't be saved. The list has been refreshed.",
          variant: "destructive",
        });
        return;
      }
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: Partial<Location>) => {
      const response = await apiRequest('POST', '/api/locations', data);
      return await response.json() as Location & { warnings?: LocationIssue[] };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setAddDialogOpen(false);
      setAddForm({});
      const warnings = data.warnings ?? [];
      if (warnings.length > 0) {
        toast({
          title: "Location Added With Warnings",
          description: warnings.map(w => w.message).join(' '),
        });
      } else {
        toast({
          title: "Location Added",
          description: "Location has been added successfully.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Add Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const geocodeMutation = useMutation({
    mutationFn: async (data: { id: string; address: string }) => {
      const response = await apiRequest('POST', '/api/geocode', { address: data.address });
      const geocoded = await response.json() as { lat: number; lon: number; formatted_address: string };
      await apiRequest('PUT', `/api/locations/${data.id}`, { lat: geocoded.lat, lon: geocoded.lon });
      return geocoded;
    },
    onSuccess: (geocoded) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setGeocodeOpenId(null);
      setGeocodeAddress("");
      toast({
        title: "Coordinates Updated",
        description: `Set to ${geocoded.lat.toFixed(4)}, ${geocoded.lon.toFixed(4)} (${geocoded.formatted_address}).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Geocode Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const savePinMutation = useMutation({
    mutationFn: async (data: { id: string; lat: number; lon: number }) => {
      await apiRequest('PUT', `/api/locations/${data.id}`, { lat: data.lat, lon: data.lon });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setGeocodeOpenId(null);
      setGeocodeAddress("");
      setPinnedCoords(null);
      toast({
        title: "Coordinates Updated",
        description: `Pinned to ${data.lat.toFixed(4)}, ${data.lon.toFixed(4)}.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Save Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const loadSizeMutation = useMutation({
    mutationFn: (data: { id: string; default_units_loaded: number }) =>
      apiRequest('PUT', `/api/locations/${data.id}`, { default_units_loaded: data.default_units_loaded }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setLoadSizeDrafts(prev => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({
        title: "Load Size Updated",
        description: "Default load size has been set.",
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

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest('DELETE', '/api/locations/bulk', { ids });
      return await response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setSelectedLocations(new Set());
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Locations Deleted",
        description: `Successfully deleted ${data.deleted} location(s).`,
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

  const deleteByRoleMutation = useMutation({
    mutationFn: async (role: 'pickup' | 'dropoff' | 'both' | 'yard') => {
      const response = await apiRequest('DELETE', `/api/locations/by-role/${role}`, {});
      return await response.json();
    },
    onSuccess: (data, role) => {
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Locations Deleted",
        description: `Successfully deleted ${data.deleted} ${role} location(s).`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete by Role Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (location: Location) => {
    setEditingLocation(location);
    setEditForm({
      name: location.name,
      location_id: location.location_id,
      role: location.role,
      lat: location.lat,
      lon: location.lon,
      allowed_load_types: location.allowed_load_types,
      default_units_loaded: location.default_units_loaded,
      default_pickup_min: location.default_pickup_min,
      default_dropoff_min: location.default_dropoff_min,
      notes: location.notes,
      is_base_yard: location.is_base_yard,
    });
  };

  const handleSave = () => {
    if (!editingLocation) return;
    
    const updates = {
      ...editForm,
      role: editForm.is_base_yard ? 'yard' : editForm.role
    };

    // Data-quality warnings are computed server-side and surfaced via the
    // mutation's onSuccess handler (single source of truth).
    updateMutation.mutate({
      id: editingLocation.location_id,
      updates
    });
  };

  const handleCancel = () => {
    setEditingLocation(null);
    setEditForm({});
  };

  const handleGeocodeOpenChange = (location: Location, open: boolean) => {
    if (open) {
      setGeocodeOpenId(location.location_id);
      setGeocodeAddress(location.name || "");
      setPinnedCoords(
        hasValidCoordinates(location)
          ? { lat: location.lat as number, lon: location.lon as number }
          : null,
      );
    } else {
      setGeocodeOpenId(null);
      setGeocodeAddress("");
      setPinnedCoords(null);
    }
  };

  const handleFixAllFlagged = async () => {
    const toFix = locations.filter(loc =>
      getLocationIssues(loc).some(
        i => i.code === 'missing_coordinates' || i.code === 'out_of_region',
      ),
    );
    if (toFix.length === 0) {
      toast({
        title: "Nothing to fix",
        description: "No locations have missing or out-of-region coordinates.",
      });
      return;
    }

    setBulkFixProposals([]);
    setBulkFixLoading(true);
    setBulkFixOpen(true);

    try {
      type GeocodeResult = {
        id: string;
        success: boolean;
        lat?: number;
        lon?: number;
        formatted_address?: string;
        error?: string;
      };

      // Chunk requests so the bulk action covers any number of flagged
      // locations in one pass, regardless of the server's per-request cap.
      const CHUNK_SIZE = 50;
      const items = toFix.map(loc => ({ id: loc.location_id, address: loc.name }));
      const chunks: typeof items[] = [];
      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        chunks.push(items.slice(i, i + CHUNK_SIZE));
      }

      const chunkResults = await Promise.all(
        chunks.map(async (chunk): Promise<GeocodeResult[]> => {
          try {
            const response = await apiRequest('POST', '/api/geocode/batch', { items: chunk });
            const data = await response.json() as { results: GeocodeResult[] };
            return data.results;
          } catch (err: any) {
            // A failed chunk shouldn't abort the whole pass — surface its items
            // as errors so the rest of the batch still gets reviewed.
            return chunk.map(item => ({
              id: item.id,
              success: false,
              error: err?.message || 'Lookup request failed',
            }));
          }
        }),
      );

      const allResults: GeocodeResult[] = chunkResults.flat();
      const byId = new Map(allResults.map(r => [r.id, r]));

      const proposals: BulkFixProposal[] = toFix.map(loc => {
        const r = byId.get(loc.location_id);
        const issue: BulkFixProposal["issue"] = hasValidCoordinates(loc)
          ? 'out_of_region'
          : 'missing';
        if (r && r.success && typeof r.lat === 'number' && typeof r.lon === 'number') {
          return {
            id: loc.location_id,
            name: loc.name,
            oldLat: loc.lat ?? null,
            oldLon: loc.lon ?? null,
            issue,
            status: 'ok',
            lat: r.lat,
            lon: r.lon,
            formatted_address: r.formatted_address,
            stillOutOfRegion: !isWithinOperatingRegion(r.lat, r.lon),
            selected: true,
          };
        }
        return {
          id: loc.location_id,
          name: loc.name,
          oldLat: loc.lat ?? null,
          oldLon: loc.lon ?? null,
          issue,
          status: 'error',
          error: r?.error ?? 'No matching location found',
          selected: false,
        };
      });
      setBulkFixProposals(proposals);
    } catch (error: any) {
      toast({
        title: "Bulk Fix Failed",
        description: error.message,
        variant: "destructive",
      });
      setBulkFixOpen(false);
    } finally {
      setBulkFixLoading(false);
    }
  };

  const toggleBulkFixSelection = (id: string, checked: boolean) => {
    setBulkFixProposals(prev =>
      prev.map(p => (p.id === id ? { ...p, selected: checked } : p)),
    );
  };

  const setAllBulkFixSelected = (checked: boolean) => {
    setBulkFixProposals(prev =>
      prev.map(p => (p.status === 'ok' ? { ...p, selected: checked } : p)),
    );
  };

  const handleApplyBulkFix = async () => {
    const selected = bulkFixProposals.filter(p => p.status === 'ok' && p.selected);
    if (selected.length === 0) return;

    setBulkFixApplying(true);
    const results = await Promise.all(
      selected.map(async p => {
        try {
          await apiRequest('PUT', `/api/locations/${p.id}`, { lat: p.lat, lon: p.lon });
          return { id: p.id, ok: true };
        } catch {
          return { id: p.id, ok: false };
        }
      }),
    );
    setBulkFixApplying(false);

    const okIds = new Set(results.filter(r => r.ok).map(r => r.id));
    const failedCount = results.length - okIds.size;

    queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
    setBulkFixProposals(prev => prev.filter(p => !okIds.has(p.id)));

    if (failedCount === 0) {
      toast({
        title: "Fixes Applied",
        description: `Updated coordinates for ${okIds.size} location(s).`,
      });
      const remaining = bulkFixProposals.filter(p => !okIds.has(p.id));
      if (remaining.length === 0) {
        setBulkFixOpen(false);
      }
    } else {
      toast({
        title: "Some Fixes Failed",
        description: `Updated ${okIds.size}, ${failedCount} failed. Review the remaining rows.`,
        variant: "destructive",
      });
    }
  };

  const handleSaveLoadSize = (locationId: string) => {
    const raw = loadSizeDrafts[locationId];
    const value = raw ? parseInt(raw, 10) : NaN;
    if (!Number.isFinite(value) || value <= 0) {
      toast({
        title: "Invalid Load Size",
        description: "Enter a load size greater than 0.",
        variant: "destructive",
      });
      return;
    }
    loadSizeMutation.mutate({ id: locationId, default_units_loaded: value });
  };

  const handleAddLocation = () => {
    if (!addForm.name || !addForm.location_id) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields (name and ID).",
        variant: "destructive",
      });
      return;
    }

    // Data-quality warnings are computed server-side and surfaced via the
    // mutation's onSuccess handler (single source of truth).
    addMutation.mutate({
      ...addForm,
      role: addForm.is_base_yard ? 'yard' : (addForm.role || 'both'),
      allowed_load_types: addForm.allowed_load_types || 'crude,diesel',
    });
  };

  const handleCancelAdd = () => {
    setAddDialogOpen(false);
    setAddForm({});
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredLocations.map(l => l.location_id));
      setSelectedLocations(allIds);
    } else {
      setSelectedLocations(new Set());
    }
  };

  const handleSelectLocation = (locationId: string, checked: boolean) => {
    const newSelected = new Set(selectedLocations);
    if (checked) {
      newSelected.add(locationId);
    } else {
      newSelected.delete(locationId);
    }
    setSelectedLocations(newSelected);
  };

  const handleBulkDelete = () => {
    verifyAndExecute(() => {
      if (bulkDeleteType === 'selected') {
        const idsToDelete = Array.from(selectedLocations);
        bulkDeleteMutation.mutate(idsToDelete);
      } else if (bulkDeleteType && ['pickup', 'dropoff', 'both', 'yard'].includes(bulkDeleteType)) {
        deleteByRoleMutation.mutate(bulkDeleteType as 'pickup' | 'dropoff' | 'both' | 'yard');
      }
    });
  };

  const handleExportToCSV = async () => {
    try {
      const response = await fetch('/api/locations/export');
      
      if (!response.ok) {
        throw new Error('Export failed');
      }
      
      // Get the filename from the Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'locations_export.csv';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Convert response to blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: `Locations exported to ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export locations. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openBulkDeleteDialog = (type: 'selected' | 'pickup' | 'dropoff' | 'both' | 'yard') => {
    setBulkDeleteType(type);
    setBulkDeleteDialogOpen(true);
  };

  const getBulkDeleteMessage = () => {
    if (!bulkDeleteType) return '';
    
    if (bulkDeleteType === 'selected') {
      return `Are you sure you want to delete ${selectedLocations.size} selected location(s)? This action cannot be undone.`;
    }
    
    const count = locations.filter(l => l.role === bulkDeleteType).length;
    return `Are you sure you want to delete all ${count} ${bulkDeleteType} location(s)? This action cannot be undone.`;
  };

  const flaggedCount = locations.filter(location => hasLocationIssues(location)).length;

  const fixableCoordCount = locations.filter(location =>
    getLocationIssues(location).some(
      i => i.code === 'missing_coordinates' || i.code === 'out_of_region',
    ),
  ).length;

  const filteredLocations = locations.filter(location =>
    (location.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      location.location_id.toLowerCase().includes(searchTerm.toLowerCase())) &&
    (!showOnlyFlagged || hasLocationIssues(location))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const isAllSelected = filteredLocations.length > 0 && 
    filteredLocations.every(l => selectedLocations.has(l.location_id));
  const isPartiallySelected = filteredLocations.some(l => selectedLocations.has(l.location_id)) && !isAllSelected;

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'pickup': return 'default';
      case 'dropoff': return 'secondary';
      case 'both': return 'outline';
      case 'yard': return 'destructive';
      default: return 'outline';
    }
  };

  const formatLoadTypes = (loadTypes: string) => {
    return loadTypes.split(',').map(type => type.trim()).join(', ');
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center">Loading locations...</div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Locations</h1>
            <p className="text-muted-foreground mt-1">
              Manage pickup and dropoff locations for route calculations.
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline"
                  data-testid="button-upload-locations"
                  className="border-muted-foreground/20 hover:bg-muted/50"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload File
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Upload Locations File</DialogTitle>
                  <DialogDescription>
                    Upload CSV or XLSX files to import multiple locations at once.
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-4">
                  <FileUploader />
                </div>
              </DialogContent>
            </Dialog>
            <Button 
              variant="outline" 
              onClick={handleExportToCSV}
              data-testid="button-export-csv"
              className="border-muted-foreground/20 hover:bg-muted/50"
            >
              <Download className="w-4 h-4 mr-2" />
              Export to CSV
            </Button>
            <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="metal" data-testid="button-add-location">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Location
                </Button>
              </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Location</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="add-name">Name *</Label>
                  <Input
                    id="add-name"
                    placeholder="Location name"
                    value={addForm.name || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, name: e.target.value }))}
                    data-testid="input-add-name"
                  />
                </div>

                <div>
                  <Label htmlFor="add-location-id">Location ID *</Label>
                  <Input
                    id="add-location-id"
                    placeholder="UNIQUE_ID"
                    value={addForm.location_id || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, location_id: e.target.value.toUpperCase() }))}
                    data-testid="input-add-location-id"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Unique identifier for this location
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="add-role">Role</Label>
                  <Select 
                    value={addForm.is_base_yard ? 'yard' : (addForm.role || 'both')} 
                    onValueChange={(value) => setAddForm(prev => ({ ...prev, role: value as 'pickup' | 'dropoff' | 'both' | 'yard' }))}
                    disabled={addForm.is_base_yard}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pickup">Pickup</SelectItem>
                      <SelectItem value="dropoff">Dropoff</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                      <SelectItem value="yard">Yard</SelectItem>
                    </SelectContent>
                  </Select>
                  {addForm.is_base_yard && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Base yards automatically have a "yard" role
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="add-lat">Latitude</Label>
                    <Input
                      id="add-lat"
                      type="number"
                      step="0.0001"
                      placeholder="34.0522"
                      value={addForm.lat || ''}
                      onChange={(e) => setAddForm(prev => ({ ...prev, lat: parseFloat(e.target.value) }))}
                      data-testid="input-add-lat"
                    />
                  </div>
                  <div>
                    <Label htmlFor="add-lon">Longitude</Label>
                    <Input
                      id="add-lon"
                      type="number"
                      step="0.0001"
                      placeholder="-118.2437"
                      value={addForm.lon || ''}
                      onChange={(e) => setAddForm(prev => ({ ...prev, lon: parseFloat(e.target.value) }))}
                      data-testid="input-add-lon"
                    />
                  </div>
                </div>

                {!addForm.is_base_yard && (
                  <>
                    {/* Show Default Units Loaded only for pickup and both locations */}
                    {(addForm.role === 'pickup' || addForm.role === 'both') && (
                      <div>
                        <Label htmlFor="add-default-units">Default Units Loaded</Label>
                        <Input
                          id="add-default-units"
                          type="number"
                          placeholder="e.g., 155"
                          value={addForm.default_units_loaded || ''}
                          onChange={(e) => setAddForm(prev => ({ 
                            ...prev, 
                            default_units_loaded: e.target.value ? parseInt(e.target.value) : undefined 
                          }))}
                          data-testid="input-add-default-units"
                        />
                        <div className="text-xs text-muted-foreground mt-1">
                          Used in batch calculations when no global amount is specified
                        </div>
                      </div>
                    )}

                    {/* Conditional timing fields based on role */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Show Default Pickup Time only for pickup and both locations */}
                      {(addForm.role === 'pickup' || addForm.role === 'both') && (
                        <div>
                          <Label htmlFor="add-pickup-min">Default Pickup Time (min)</Label>
                          <Input
                            id="add-pickup-min"
                            type="number"
                            placeholder="e.g., 45"
                            value={addForm.default_pickup_min || ''}
                            onChange={(e) => setAddForm(prev => ({ 
                              ...prev, 
                              default_pickup_min: e.target.value ? parseInt(e.target.value) : undefined 
                            }))}
                            data-testid="input-add-pickup-min"
                          />
                        </div>
                      )}
                      {/* Show Default Dropoff Time only for dropoff and both locations */}
                      {(addForm.role === 'dropoff' || addForm.role === 'both') && (
                        <div>
                          <Label htmlFor="add-dropoff-min">Default Dropoff Time (min)</Label>
                          <Input
                            id="add-dropoff-min"
                            type="number"
                            placeholder="e.g., 60"
                            value={addForm.default_dropoff_min || ''}
                            onChange={(e) => setAddForm(prev => ({ 
                              ...prev, 
                              default_dropoff_min: e.target.value ? parseInt(e.target.value) : undefined 
                            }))}
                            data-testid="input-add-dropoff-min"
                          />
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <Label htmlFor="add-load-types">Allowed Load Types</Label>
                  <Input
                    id="add-load-types"
                    placeholder="crude,diesel"
                    value={addForm.allowed_load_types || 'crude,diesel'}
                    onChange={(e) => setAddForm(prev => ({ ...prev, allowed_load_types: e.target.value }))}
                    data-testid="input-add-load-types"
                  />
                  <div className="text-xs text-muted-foreground mt-1">
                    Separate multiple types with commas
                  </div>
                </div>

                <div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="add-is-base-yard"
                      checked={addForm.is_base_yard || false}
                      onCheckedChange={(checked) => setAddForm(prev => ({ 
                        ...prev, 
                        is_base_yard: checked as boolean,
                        role: checked ? 'yard' : prev.role 
                      }))}
                      data-testid="checkbox-add-is-base-yard"
                    />
                    <Label htmlFor="add-is-base-yard">
                      Mark as Base Yard
                    </Label>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Base yards are starting points for deadhead calculations
                  </div>
                </div>

                {addForm.is_base_yard && (
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                    Base yards only need basic information - optional timing fields are hidden.
                  </div>
                )}

                <div>
                  <Label htmlFor="add-notes">Notes</Label>
                  <Input
                    id="add-notes"
                    placeholder="Additional notes..."
                    value={addForm.notes || ''}
                    onChange={(e) => setAddForm(prev => ({ ...prev, notes: e.target.value }))}
                    data-testid="input-add-notes"
                  />
                </div>

                <div className="flex justify-end space-x-2 pt-4">
                  <Button variant="outline" onClick={handleCancelAdd}>
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleAddLocation}
                    disabled={addMutation.isPending}
                    data-testid="button-confirm-add"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {addMutation.isPending ? 'Adding...' : 'Add Location'}
                  </Button>
                </div>
              </div>
            </DialogContent>
            </Dialog>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {selectedLocations.size > 0 && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => openBulkDeleteDialog('selected')}
              data-testid="button-delete-selected"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedLocations.size})
            </Button>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => openBulkDeleteDialog('pickup')}
            disabled={!locations.some(l => l.role === 'pickup')}
            data-testid="button-delete-all-pickups"
          >
            <MapPinOff className="w-4 h-4 mr-2" />
            Delete All Pickups
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => openBulkDeleteDialog('dropoff')}
            disabled={!locations.some(l => l.role === 'dropoff')}
            data-testid="button-delete-all-dropoffs"
          >
            <MapPinOff className="w-4 h-4 mr-2" />
            Delete All Dropoffs
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => openBulkDeleteDialog('yard')}
            disabled={!locations.some(l => l.role === 'yard')}
            data-testid="button-delete-all-yards"
          >
            <MapPinOff className="w-4 h-4 mr-2" />
            Delete All Yards
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Search and Filters */}
        <Card className="card-metallic">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-4">
              <div className="flex-1">
                <Input
                  placeholder="Search locations..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  data-testid="input-search-locations"
                />
              </div>
              <Button
                variant={showOnlyFlagged ? "destructive" : "outline"}
                size="sm"
                onClick={() => setShowOnlyFlagged(prev => !prev)}
                disabled={flaggedCount === 0 && !showOnlyFlagged}
                data-testid="button-filter-flagged"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                {showOnlyFlagged ? "Show All" : `Needs Attention (${flaggedCount})`}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleFixAllFlagged}
                disabled={fixableCoordCount === 0 || bulkFixLoading}
                data-testid="button-fix-all-flagged"
              >
                {bulkFixLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Wand2 className="w-4 h-4 mr-2" />
                )}
                {`Fix all flagged (${fixableCoordCount})`}
              </Button>
              <div className="text-sm text-muted-foreground">
                {filteredLocations.length} of {locations.length} locations
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locations Table */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle className="flex items-center">
              <MapPin className="w-5 h-5 text-primary mr-2" />
              Location List
            </CardTitle>
          </CardHeader>
          <CardContent>
            {filteredLocations.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {locations.length === 0 ? "No locations found. Upload a file or add locations manually." : "No locations match your search."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table className="shadow-metallic-sm">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={isAllSelected}
                          onCheckedChange={handleSelectAll}
                          aria-label="Select all"
                          data-testid="checkbox-select-all"
                          className={isPartiallySelected ? "data-[state=checked]:bg-muted" : ""}
                        />
                      </TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Coordinates</TableHead>
                      <TableHead>Load Types</TableHead>
                      <TableHead>Default Units</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLocations.map((location) => (
                      <TableRow key={location.location_id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedLocations.has(location.location_id)}
                            onCheckedChange={(checked) => 
                              handleSelectLocation(location.location_id, checked as boolean)
                            }
                            aria-label={`Select ${location.name}`}
                            data-testid={`checkbox-location-${location.location_id}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {location.name}
                            {(() => {
                              const issues = getLocationIssues(location);
                              if (issues.length === 0) return null;
                              return (
                                <div className="group relative" data-testid={`indicator-issues-${location.location_id}`}>
                                  <AlertTriangle className="w-4 h-4 text-destructive" />
                                  <div className="absolute hidden group-hover:block z-10 p-2 bg-popover text-popover-foreground text-xs rounded-md shadow-md w-64 bottom-full left-0 mb-1 border">
                                    <div className="font-medium mb-1">Needs attention:</div>
                                    <ul className="list-disc list-inside space-y-1">
                                      {issues.map(issue => (
                                        <li key={issue.code}>{issue.message}</li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              );
                            })()}
                            {location.is_base_yard && (
                              <Badge variant="secondary" className="text-xs">
                                Base Yard
                              </Badge>
                            )}
                          </div>
                          {location.notes && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {location.notes}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {location.location_id}
                        </TableCell>
                        <TableCell>
                          <Badge variant={getRoleBadgeVariant(location.role)}>
                            {location.role === 'yard' ? 'Yard' : location.role.charAt(0).toUpperCase() + location.role.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {(() => {
                            const coordIssues = getLocationIssues(location);
                            const missing = !hasValidCoordinates(location);
                            const outOfRegion = coordIssues.some(i => i.code === 'out_of_region');
                            const needsFix = missing || outOfRegion;
                            return (
                              <div className="flex items-center gap-2">
                                {missing ? (
                                  <div className="flex items-center gap-2 text-destructive">
                                    <MapPinOff className="w-4 h-4" />
                                    <span>Missing</span>
                                  </div>
                                ) : outOfRegion ? (
                                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500">
                                    <AlertTriangle className="w-4 h-4" />
                                    <span>{location.lat!.toFixed(4)}, {location.lon!.toFixed(4)}</span>
                                  </div>
                                ) : (
                                  <span>{location.lat!.toFixed(4)}, {location.lon!.toFixed(4)}</span>
                                )}
                                {needsFix && (
                                  <Popover
                                    open={geocodeOpenId === location.location_id}
                                    onOpenChange={(open) => handleGeocodeOpenChange(location, open)}
                                  >
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2"
                                        data-testid={`button-geocode-${location.location_id}`}
                                      >
                                        <Wand2 className="w-3.5 h-3.5 mr-1" />
                                        Fix
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-96" align="start">
                                      <div className="space-y-3">
                                        <div>
                                          <Label htmlFor={`geocode-address-${location.location_id}`}>
                                            Geocode by address
                                          </Label>
                                          <p className="text-xs text-muted-foreground mt-1">
                                            Look up coordinates from an address or place name.
                                          </p>
                                        </div>
                                        <Input
                                          id={`geocode-address-${location.location_id}`}
                                          placeholder="e.g., 123 Main St, Bakersfield, CA"
                                          value={geocodeAddress}
                                          onChange={(e) => setGeocodeAddress(e.target.value)}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' && geocodeAddress.trim() && !geocodeMutation.isPending) {
                                              geocodeMutation.mutate({ id: location.location_id, address: geocodeAddress.trim() });
                                            }
                                          }}
                                          data-testid={`input-geocode-address-${location.location_id}`}
                                        />
                                        <div className="flex justify-end gap-2">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleGeocodeOpenChange(location, false)}
                                          >
                                            Cancel
                                          </Button>
                                          <Button
                                            size="sm"
                                            onClick={() => geocodeMutation.mutate({ id: location.location_id, address: geocodeAddress.trim() })}
                                            disabled={!geocodeAddress.trim() || geocodeMutation.isPending}
                                            data-testid={`button-confirm-geocode-${location.location_id}`}
                                          >
                                            {geocodeMutation.isPending ? (
                                              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                            ) : (
                                              <Wand2 className="w-3.5 h-3.5 mr-1" />
                                            )}
                                            {geocodeMutation.isPending ? 'Looking up...' : 'Geocode & Save'}
                                          </Button>
                                        </div>
                                        <div className="border-t pt-3 space-y-2">
                                          <div>
                                            <Label>Or pin on the map</Label>
                                            <p className="text-xs text-muted-foreground mt-1">
                                              Click to drop a pin, drag to fine-tune. Centered on Kern County.
                                            </p>
                                          </div>
                                          {geocodeOpenId === location.location_id && (
                                            <MapPinPicker
                                              initialLat={location.lat}
                                              initialLon={location.lon}
                                              value={pinnedCoords}
                                              onChange={setPinnedCoords}
                                            />
                                          )}
                                          <div className="flex justify-end">
                                            <Button
                                              size="sm"
                                              onClick={() => pinnedCoords && savePinMutation.mutate({ id: location.location_id, lat: pinnedCoords.lat, lon: pinnedCoords.lon })}
                                              disabled={!pinnedCoords || savePinMutation.isPending}
                                              data-testid={`button-save-pin-${location.location_id}`}
                                            >
                                              {savePinMutation.isPending ? (
                                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                              ) : (
                                                <MapPin className="w-3.5 h-3.5 mr-1" />
                                              )}
                                              {savePinMutation.isPending ? 'Saving...' : 'Save pinned location'}
                                            </Button>
                                          </div>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {formatLoadTypes(location.allowed_load_types)}
                        </TableCell>
                        <TableCell>
                          {getLocationIssues(location).some(i => i.code === 'missing_load_size') ? (
                            <div className="flex items-center gap-1">
                              <Input
                                type="number"
                                min="1"
                                placeholder="e.g., 155"
                                className="h-8 w-24"
                                value={loadSizeDrafts[location.location_id] ?? ''}
                                onChange={(e) => setLoadSizeDrafts(prev => ({ ...prev, [location.location_id]: e.target.value }))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleSaveLoadSize(location.location_id);
                                  }
                                }}
                                data-testid={`input-loadsize-${location.location_id}`}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 px-2"
                                onClick={() => handleSaveLoadSize(location.location_id)}
                                disabled={loadSizeMutation.isPending}
                                data-testid={`button-save-loadsize-${location.location_id}`}
                              >
                                {loadSizeMutation.isPending && loadSizeMutation.variables?.id === location.location_id ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            location.default_units_loaded || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => handleEdit(location)}
                              data-testid={`button-edit-${location.location_id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => verifyAndExecute(() => deleteMutation.mutate(location.location_id))}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${location.location_id}`}
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
      </div>

      {/* Edit Location Dialog */}
      <Dialog 
        open={!!editingLocation}
        onOpenChange={(open) => {
          if (!open) {
            handleCancel();
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Location</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                placeholder="Location name"
                value={editForm.name || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                data-testid="input-edit-name"
              />
            </div>

            <div>
              <Label htmlFor="edit-location-id">Location ID *</Label>
              <Input
                id="edit-location-id"
                placeholder="UNIQUE_ID"
                value={editForm.location_id || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, location_id: e.target.value.toUpperCase() }))}
                data-testid="input-edit-location-id"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Unique identifier for this location
              </div>
            </div>
            
            <div>
              <Label htmlFor="edit-role">Role</Label>
              <Select 
                value={editForm.is_base_yard ? 'yard' : (editForm.role || 'both')} 
                onValueChange={(value) => setEditForm(prev => ({ ...prev, role: value as 'pickup' | 'dropoff' | 'both' | 'yard' }))}
                disabled={editForm.is_base_yard}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickup">Pickup</SelectItem>
                  <SelectItem value="dropoff">Dropoff</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                  <SelectItem value="yard">Yard</SelectItem>
                </SelectContent>
              </Select>
              {editForm.is_base_yard && (
                <div className="text-xs text-muted-foreground mt-1">
                  Base yards automatically have a "yard" role
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="edit-lat">Latitude *</Label>
                <Input
                  id="edit-lat"
                  type="number"
                  step="0.0001"
                  placeholder="34.0522"
                  value={editForm.lat || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, lat: parseFloat(e.target.value) }))}
                  data-testid="input-edit-lat"
                />
              </div>
              <div>
                <Label htmlFor="edit-lon">Longitude *</Label>
                <Input
                  id="edit-lon"
                  type="number"
                  step="0.0001"
                  placeholder="-118.2437"
                  value={editForm.lon || ''}
                  onChange={(e) => setEditForm(prev => ({ ...prev, lon: parseFloat(e.target.value) }))}
                  data-testid="input-edit-lon"
                />
              </div>
            </div>

            {!editForm.is_base_yard && (
              <>
                {/* Show Default Units Loaded only for pickup and both locations */}
                {(editForm.role === 'pickup' || editForm.role === 'both' || !editForm.role) && (
                  <div>
                    <Label htmlFor="edit-default-units">Default Units Loaded</Label>
                    <Input
                      id="edit-default-units"
                      type="number"
                      placeholder="e.g., 155"
                      value={editForm.default_units_loaded || ''}
                      onChange={(e) => setEditForm(prev => ({ 
                        ...prev, 
                        default_units_loaded: e.target.value ? parseInt(e.target.value) : undefined 
                      }))}
                      data-testid="input-edit-default-units"
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Used in batch calculations when no global amount is specified
                    </div>
                  </div>
                )}

                {/* Conditional timing fields based on role */}
                <div className="grid grid-cols-2 gap-2">
                  {/* Show Default Pickup Time only for pickup and both locations */}
                  {(editForm.role === 'pickup' || editForm.role === 'both' || !editForm.role) && (
                    <div>
                      <Label htmlFor="edit-pickup-min">Default Pickup Time (min)</Label>
                      <Input
                        id="edit-pickup-min"
                        type="number"
                        placeholder="e.g., 45"
                        value={editForm.default_pickup_min || ''}
                        onChange={(e) => setEditForm(prev => ({ 
                          ...prev, 
                          default_pickup_min: e.target.value ? parseInt(e.target.value) : undefined 
                        }))}
                        data-testid="input-edit-pickup-min"
                      />
                    </div>
                  )}
                  {/* Show Default Dropoff Time only for dropoff and both locations */}
                  {(editForm.role === 'dropoff' || editForm.role === 'both' || !editForm.role) && (
                    <div>
                      <Label htmlFor="edit-dropoff-min">Default Dropoff Time (min)</Label>
                      <Input
                        id="edit-dropoff-min"
                        type="number"
                        placeholder="e.g., 60"
                        value={editForm.default_dropoff_min || ''}
                        onChange={(e) => setEditForm(prev => ({ 
                          ...prev, 
                          default_dropoff_min: e.target.value ? parseInt(e.target.value) : undefined 
                        }))}
                        data-testid="input-edit-dropoff-min"
                      />
                    </div>
                  )}
                </div>
              </>
            )}

            {editForm.is_base_yard && (
              <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                Base yards only need basic information - optional timing fields are hidden.
              </div>
            )}

            <div>
              <Label htmlFor="edit-load-types">Allowed Load Types</Label>
              <Input
                id="edit-load-types"
                placeholder="crude,diesel"
                value={editForm.allowed_load_types || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, allowed_load_types: e.target.value }))}
                data-testid="input-edit-load-types"
              />
              <div className="text-xs text-muted-foreground mt-1">
                Separate multiple types with commas
              </div>
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="edit-is-base-yard"
                  checked={editForm.is_base_yard || false}
                  onCheckedChange={(checked) => setEditForm(prev => ({ 
                    ...prev, 
                    is_base_yard: checked as boolean,
                    role: checked ? 'yard' : prev.role 
                  }))}
                  data-testid="checkbox-edit-is-base-yard"
                />
                <Label htmlFor="edit-is-base-yard">
                  Mark as Base Yard
                </Label>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Base yards are starting points for deadhead calculations
              </div>
            </div>

            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Input
                id="edit-notes"
                placeholder="Additional notes..."
                value={editForm.notes || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                data-testid="input-edit-notes"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button variant="outline" onClick={handleCancel}>
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button 
                onClick={handleSave}
                disabled={updateMutation.isPending}
              >
                <Save className="w-4 h-4 mr-1" />
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Bulk Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {getBulkDeleteMessage()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkFixOpen} onOpenChange={(open) => { if (!bulkFixApplying) setBulkFixOpen(open); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Fix all flagged locations</DialogTitle>
            <DialogDescription>
              Coordinates were looked up from each location's name. Review the proposed
              fixes and deselect any you don't trust, then apply the rest.
            </DialogDescription>
          </DialogHeader>

          {bulkFixLoading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Looking up coordinates...
            </div>
          ) : (
            (() => {
              const okProposals = bulkFixProposals.filter(p => p.status === 'ok');
              const errorProposals = bulkFixProposals.filter(p => p.status === 'error');
              const selectedCount = okProposals.filter(p => p.selected).length;
              const allOkSelected = okProposals.length > 0 && selectedCount === okProposals.length;
              return (
                <div className="space-y-3">
                  {okProposals.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={allOkSelected}
                        onCheckedChange={(checked) => setAllBulkFixSelected(checked as boolean)}
                        aria-label="Select all proposed fixes"
                        data-testid="checkbox-bulkfix-select-all"
                      />
                      <span className="text-muted-foreground">
                        {selectedCount} of {okProposals.length} fixes selected
                      </span>
                    </div>
                  )}

                  <div className="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
                    {okProposals.map(p => (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 rounded-md border p-3"
                        data-testid={`bulkfix-proposal-${p.id}`}
                      >
                        <Checkbox
                          checked={p.selected}
                          onCheckedChange={(checked) => toggleBulkFixSelection(p.id, checked as boolean)}
                          aria-label={`Include fix for ${p.name}`}
                          className="mt-1"
                          data-testid={`checkbox-bulkfix-${p.id}`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium">{p.name}</span>
                            <Badge variant={p.issue === 'missing' ? 'destructive' : 'secondary'} className="text-xs">
                              {p.issue === 'missing' ? 'No coordinates' : 'Outside region'}
                            </Badge>
                            {p.stillOutOfRegion && (
                              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-500 border-amber-500">
                                Still outside region
                              </Badge>
                            )}
                          </div>
                          {p.formatted_address && (
                            <div className="text-xs text-muted-foreground mt-1 truncate">
                              {p.formatted_address}
                            </div>
                          )}
                          <div className="text-xs font-mono mt-1">
                            {p.issue === 'out_of_region' && p.oldLat != null && p.oldLon != null && (
                              <span className="text-muted-foreground line-through mr-2">
                                {p.oldLat.toFixed(4)}, {p.oldLon.toFixed(4)}
                              </span>
                            )}
                            <span className="text-foreground">
                              {p.lat!.toFixed(4)}, {p.lon!.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {errorProposals.length > 0 && (
                      <div className="pt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-2">
                          Couldn't look these up — fix them manually:
                        </div>
                        {errorProposals.map(p => (
                          <div
                            key={p.id}
                            className="flex items-start gap-3 rounded-md border border-dashed p-3 opacity-80"
                            data-testid={`bulkfix-error-${p.id}`}
                          >
                            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{p.name}</span>
                              <div className="text-xs text-destructive mt-1">{p.error}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {bulkFixProposals.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground text-sm">
                        No proposed fixes to review.
                      </div>
                    )}
                  </div>
                </div>
              );
            })()
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBulkFixOpen(false)}
              disabled={bulkFixApplying}
              data-testid="button-bulkfix-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApplyBulkFix}
              disabled={
                bulkFixApplying ||
                bulkFixLoading ||
                bulkFixProposals.filter(p => p.status === 'ok' && p.selected).length === 0
              }
              data-testid="button-bulkfix-apply"
            >
              {bulkFixApplying ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {bulkFixApplying
                ? 'Applying...'
                : `Apply ${bulkFixProposals.filter(p => p.status === 'ok' && p.selected).length} fix(es)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PinVerificationModal
        open={showModal}
        onOpenChange={setShowModal}
        onVerified={handleVerified}
        title="Confirm Action"
        description="Please enter your PIN to delete or modify this data."
      />
    </div>
  );
}
