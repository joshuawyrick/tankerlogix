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
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Route, Plus, Edit, Trash2, AlertTriangle, Download, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PinVerificationModal, usePinVerification } from "@/components/pin-verification-modal";
import type { ContractedRoute, Location, Customer } from "@shared/schema";

export default function ContractedRoutes() {
  const { toast } = useToast();
  const { showModal, setShowModal, verifyAndExecute, handleVerified } = usePinVerification();
  const [searchTerm, setSearchTerm] = useState("");
  const [editingRoute, setEditingRoute] = useState<ContractedRoute | null>(null);
  const [editForm, setEditForm] = useState<Partial<ContractedRoute>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<Partial<ContractedRoute>>({
    product_type: "crude",
    rate_type: "per_barrel",
  });
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const { data: routes = [], isLoading } = useQuery<ContractedRoute[]>({
    queryKey: ['/api/contracted-routes'],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Use all locations for both pickup and dropoff dropdowns (sorted alphabetically)
  const pickupLocations = [...locations].sort((a, b) => a.name.localeCompare(b.name));
  const dropoffLocations = [...locations].sort((a, b) => a.name.localeCompare(b.name));

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/contracted-routes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      toast({
        title: "Route Deleted",
        description: "Contracted route has been successfully removed.",
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
    mutationFn: (data: { id: string; updates: Partial<ContractedRoute> }) => 
      apiRequest('PATCH', `/api/contracted-routes/${data.id}`, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      setEditingRoute(null);
      setEditForm({});
      toast({
        title: "Route Updated",
        description: "Contracted route has been updated successfully.",
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
    mutationFn: (data: Partial<ContractedRoute>) => 
      apiRequest('POST', '/api/contracted-routes', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      setAddDialogOpen(false);
      setAddForm({ product_type: "crude", rate_type: "per_barrel" });
      toast({
        title: "Route Added",
        description: "Contracted route has been added successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Add Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await apiRequest('DELETE', '/api/contracted-routes/bulk', { ids });
      return response;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      setSelectedRoutes(new Set());
      setBulkDeleteDialogOpen(false);
      toast({
        title: "Routes Deleted",
        description: `Successfully deleted ${data.deleted} route(s).`,
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

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload/contracted-routes', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/contracted-routes'] });
      setUploadDialogOpen(false);
      setUploadFile(null);
      toast({
        title: "Upload Complete",
        description: `Added ${data.addedCount} route(s). ${data.skippedCount > 0 ? `Skipped ${data.skippedCount} duplicate(s).` : ''}`,
      });
      
      if (data.errors && data.errors.length > 0) {
        console.error("Upload errors:", data.errors);
        toast({
          title: "Some Routes Had Issues",
          description: `Check the console for details. ${data.errors.length} error(s) occurred.`,
          variant: "destructive",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleEdit = (route: ContractedRoute) => {
    setEditingRoute(route);
    setEditForm({
      route_name: route.route_name,
      customer_id: route.customer_id,
      pickup_location_id: route.pickup_location_id,
      dropoff_location_id: route.dropoff_location_id,
      product_type: route.product_type,
      avg_volume: route.avg_volume,
      rate_per_unit: route.rate_per_unit,
      rate_type: route.rate_type,
      avg_pickup_time: route.avg_pickup_time,
      avg_dropoff_time: route.avg_dropoff_time,
      avg_speed: route.avg_speed,
      notes: route.notes,
    });
    setEditDialogOpen(true);
  };

  const handleSave = () => {
    if (!editingRoute) return;
    
    updateMutation.mutate({
      id: editingRoute.route_id,
      updates: editForm
    });
    setEditDialogOpen(false);
  };

  const handleCancel = () => {
    setEditingRoute(null);
    setEditForm({});
    setEditDialogOpen(false);
  };

  const handleAddRoute = () => {
    if (!addForm.route_name || !addForm.pickup_location_id || !addForm.dropoff_location_id) {
      toast({
        title: "Missing Fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    if (addForm.pickup_location_id === addForm.dropoff_location_id) {
      toast({
        title: "Invalid Route",
        description: "Pickup and dropoff locations cannot be the same.",
        variant: "destructive",
      });
      return;
    }

    addMutation.mutate(addForm);
  };

  const handleCancelAdd = () => {
    setAddDialogOpen(false);
    setAddForm({ product_type: "crude", rate_type: "per_barrel" });
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const allIds = new Set(filteredRoutes.map(r => r.route_id));
      setSelectedRoutes(allIds);
    } else {
      setSelectedRoutes(new Set());
    }
  };

  const handleSelectRoute = (routeId: string, checked: boolean) => {
    const newSelected = new Set(selectedRoutes);
    if (checked) {
      newSelected.add(routeId);
    } else {
      newSelected.delete(routeId);
    }
    setSelectedRoutes(newSelected);
  };

  const handleBulkDelete = () => {
    verifyAndExecute(() => {
      bulkDeleteMutation.mutate(Array.from(selectedRoutes));
    });
  };

  const handleDownloadTemplate = async () => {
    try {
      const response = await fetch('/api/contracted-routes-template');
      if (!response.ok) throw new Error('Template download failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contracted_routes_template.csv';
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Template Downloaded",
        description: "Template file has been downloaded. Fill it with your data and upload.",
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to download template file.",
        variant: "destructive",
      });
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/contracted-routes/export');
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'contracted_routes.csv';
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Export Successful",
        description: "Contracted routes have been exported to CSV.",
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export contracted routes.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!uploadFile) {
      toast({
        title: "No File Selected",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate(uploadFile);
  };

  const getLocationName = (locationId: string | undefined) => {
    if (!locationId) return '';
    const location = locations.find(l => l.location_id === locationId);
    return location?.name || locationId;
  };

  const getVolumeUnit = (productType: string | undefined) => {
    if (productType === 'diesel') return 'gallons';
    return 'barrels';
  };

  const getRateTypeDisplay = (rateType: string | undefined) => {
    switch (rateType) {
      case 'per_barrel': return 'Per Barrel';
      case 'per_gallon': return 'Per Gallon';
      case 'flat_rate': return 'Flat Rate';
      default: return rateType;
    }
  };

  const filteredRoutes = routes.filter(route =>
    route.route_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getLocationName(route.pickup_location_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
    getLocationName(route.dropoff_location_id).toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg text-muted-foreground">Loading contracted routes...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Route className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Contracted Routes</h1>
        </div>
        <div className="flex space-x-2">
          <Button onClick={handleDownloadTemplate} variant="outline" data-testid="button-download-template">
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
          <Button onClick={handleExport} variant="outline" data-testid="button-export">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-upload">
                <Upload className="h-4 w-4 mr-2" />
                Bulk Upload
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload Contracted Routes</DialogTitle>
                <DialogDescription>
                  Upload a CSV or Excel file with contracted routes. The file should have columns: route_name, pickup_location, dropoff_location, product_type, avg_volume, rate_per_unit, rate_type
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="file" className="text-right">
                    File
                  </Label>
                  <Input
                    id="file"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="col-span-3"
                    data-testid="input-file"
                  />
                </div>
                {uploadFile && (
                  <div className="text-sm text-muted-foreground">
                    Selected: {uploadFile.name}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => {
                  setUploadDialogOpen(false);
                  setUploadFile(null);
                }}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpload} 
                  disabled={!uploadFile || uploadMutation.isPending}
                  data-testid="button-upload-confirm"
                >
                  {uploadMutation.isPending ? "Uploading..." : "Upload"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="button-add-route">
                <Plus className="h-4 w-4 mr-2" />
                Add Route
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Add Contracted Route</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="route-name" className="text-right">
                    Route Name
                  </Label>
                  <Input
                    id="route-name"
                    value={addForm.route_name || ''}
                    className="col-span-3 bg-muted"
                    placeholder="Select pickup and dropoff to generate name"
                    data-testid="input-route-name"
                    disabled
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="customer" className="text-right">
                    Customer
                  </Label>
                  <Select
                    value={addForm.customer_id || 'none'}
                    onValueChange={(value) => setAddForm({ ...addForm, customer_id: value === 'none' ? undefined : value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-customer">
                      <SelectValue placeholder="Select customer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">N/A - No Customer</SelectItem>
                      {customers.map(customer => (
                        <SelectItem key={customer.customer_id} value={customer.customer_id}>
                          {customer.customer_name} ({customer.customer_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="pickup" className="text-right">
                    Pickup
                  </Label>
                  <Select
                    value={addForm.pickup_location_id}
                    onValueChange={(value) => {
                      const pickup = locations.find(l => l.location_id === value);
                      const dropoff = locations.find(l => l.location_id === addForm.dropoff_location_id);
                      setAddForm({ 
                        ...addForm, 
                        pickup_location_id: value,
                        route_name: pickup && dropoff ? `${pickup.name} to ${dropoff.name}` : addForm.route_name
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-pickup">
                      <SelectValue placeholder="Select pickup location" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickupLocations.map(loc => (
                        <SelectItem key={loc.location_id} value={loc.location_id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="dropoff" className="text-right">
                    Dropoff
                  </Label>
                  <Select
                    value={addForm.dropoff_location_id}
                    onValueChange={(value) => {
                      const pickup = locations.find(l => l.location_id === addForm.pickup_location_id);
                      const dropoff = locations.find(l => l.location_id === value);
                      setAddForm({ 
                        ...addForm, 
                        dropoff_location_id: value,
                        route_name: pickup && dropoff ? `${pickup.name} to ${dropoff.name}` : addForm.route_name
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-dropoff">
                      <SelectValue placeholder="Select dropoff location" />
                    </SelectTrigger>
                    <SelectContent>
                      {dropoffLocations.map(loc => (
                        <SelectItem key={loc.location_id} value={loc.location_id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="product" className="text-right">
                    Product Type
                  </Label>
                  <Select
                    value={addForm.product_type}
                    onValueChange={(value: "crude" | "diesel" | "both") => setAddForm({ ...addForm, product_type: value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-product">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crude">Crude</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="volume" className="text-right">
                    Avg Volume ({getVolumeUnit(addForm.product_type)})
                  </Label>
                  <Input
                    id="volume"
                    type="number"
                    value={addForm.avg_volume || ''}
                    onChange={(e) => setAddForm({ ...addForm, avg_volume: parseFloat(e.target.value) })}
                    className="col-span-3"
                    data-testid="input-volume"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rate" className="text-right">
                    Rate ($)
                  </Label>
                  <Input
                    id="rate"
                    type="number"
                    step="0.01"
                    value={addForm.rate_per_unit || ''}
                    onChange={(e) => setAddForm({ ...addForm, rate_per_unit: parseFloat(e.target.value) })}
                    className="col-span-3"
                    data-testid="input-rate"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rate-type" className="text-right">
                    Rate Type
                  </Label>
                  <Select
                    value={addForm.rate_type}
                    onValueChange={(value: "per_barrel" | "per_gallon" | "flat_rate") => setAddForm({ ...addForm, rate_type: value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-rate-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_barrel">Per Barrel</SelectItem>
                      <SelectItem value="per_gallon">Per Gallon</SelectItem>
                      <SelectItem value="flat_rate">Flat Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="pickup-time" className="text-right">
                    Pickup Time (min)
                  </Label>
                  <Input
                    id="pickup-time"
                    type="number"
                    value={addForm.avg_pickup_time || ''}
                    onChange={(e) => setAddForm({ ...addForm, avg_pickup_time: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-pickup-time"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="dropoff-time" className="text-right">
                    Dropoff Time (min)
                  </Label>
                  <Input
                    id="dropoff-time"
                    type="number"
                    value={addForm.avg_dropoff_time || ''}
                    onChange={(e) => setAddForm({ ...addForm, avg_dropoff_time: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-dropoff-time"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="speed" className="text-right">
                    Avg Speed (mph)
                  </Label>
                  <Input
                    id="speed"
                    type="number"
                    value={addForm.avg_speed || ''}
                    onChange={(e) => setAddForm({ ...addForm, avg_speed: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-speed"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="notes" className="text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="notes"
                    value={addForm.notes || ''}
                    onChange={(e) => setAddForm({ ...addForm, notes: e.target.value })}
                    className="col-span-3"
                    placeholder="Optional notes"
                    data-testid="input-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancelAdd}>
                  Cancel
                </Button>
                <Button onClick={handleAddRoute} data-testid="button-save-route">
                  Add Route
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          {/* Edit Route Dialog */}
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Edit Contracted Route</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-route-name" className="text-right">
                    Route Name
                  </Label>
                  <Input
                    id="edit-route-name"
                    value={editForm.route_name || ''}
                    className="col-span-3 bg-muted"
                    placeholder="Select pickup and dropoff to generate name"
                    data-testid="input-edit-route-name"
                    disabled
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-customer" className="text-right">
                    Customer
                  </Label>
                  <Select
                    value={editForm.customer_id || 'none'}
                    onValueChange={(value) => setEditForm({ ...editForm, customer_id: value === 'none' ? undefined : value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-edit-customer">
                      <SelectValue placeholder="Select customer (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">N/A - No Customer</SelectItem>
                      {customers.map(customer => (
                        <SelectItem key={customer.customer_id} value={customer.customer_id}>
                          {customer.customer_name} ({customer.customer_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-pickup" className="text-right">
                    Pickup
                  </Label>
                  <Select
                    value={editForm.pickup_location_id}
                    onValueChange={(value) => {
                      const pickup = locations.find(l => l.location_id === value);
                      const dropoff = locations.find(l => l.location_id === editForm.dropoff_location_id);
                      setEditForm({ 
                        ...editForm, 
                        pickup_location_id: value,
                        route_name: pickup && dropoff ? `${pickup.name} to ${dropoff.name}` : editForm.route_name
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-edit-pickup">
                      <SelectValue placeholder="Select pickup location" />
                    </SelectTrigger>
                    <SelectContent>
                      {pickupLocations.map(loc => (
                        <SelectItem key={loc.location_id} value={loc.location_id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-dropoff" className="text-right">
                    Dropoff
                  </Label>
                  <Select
                    value={editForm.dropoff_location_id}
                    onValueChange={(value) => {
                      const pickup = locations.find(l => l.location_id === editForm.pickup_location_id);
                      const dropoff = locations.find(l => l.location_id === value);
                      setEditForm({ 
                        ...editForm, 
                        dropoff_location_id: value,
                        route_name: pickup && dropoff ? `${pickup.name} to ${dropoff.name}` : editForm.route_name
                      });
                    }}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-edit-dropoff">
                      <SelectValue placeholder="Select dropoff location" />
                    </SelectTrigger>
                    <SelectContent>
                      {dropoffLocations.map(loc => (
                        <SelectItem key={loc.location_id} value={loc.location_id}>
                          {loc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-product" className="text-right">
                    Product Type
                  </Label>
                  <Select
                    value={editForm.product_type}
                    onValueChange={(value: "crude" | "diesel" | "both") => setEditForm({ ...editForm, product_type: value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-edit-product">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crude">Crude</SelectItem>
                      <SelectItem value="diesel">Diesel</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-volume" className="text-right">
                    Avg Volume ({getVolumeUnit(editForm.product_type || 'crude')})
                  </Label>
                  <Input
                    id="edit-volume"
                    type="number"
                    value={editForm.avg_volume || ''}
                    onChange={(e) => setEditForm({ ...editForm, avg_volume: parseFloat(e.target.value) })}
                    className="col-span-3"
                    data-testid="input-edit-volume"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-rate" className="text-right">
                    Rate ($)
                  </Label>
                  <Input
                    id="edit-rate"
                    type="number"
                    step="0.01"
                    value={editForm.rate_per_unit || ''}
                    onChange={(e) => setEditForm({ ...editForm, rate_per_unit: parseFloat(e.target.value) })}
                    className="col-span-3"
                    data-testid="input-edit-rate"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-rate-type" className="text-right">
                    Rate Type
                  </Label>
                  <Select
                    value={editForm.rate_type}
                    onValueChange={(value: "per_barrel" | "per_gallon" | "flat_rate") => setEditForm({ ...editForm, rate_type: value })}
                  >
                    <SelectTrigger className="col-span-3" data-testid="select-edit-rate-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="per_barrel">Per Barrel</SelectItem>
                      <SelectItem value="per_gallon">Per Gallon</SelectItem>
                      <SelectItem value="flat_rate">Flat Rate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-pickup-time" className="text-right">
                    Pickup Time (min)
                  </Label>
                  <Input
                    id="edit-pickup-time"
                    type="number"
                    value={editForm.avg_pickup_time || ''}
                    onChange={(e) => setEditForm({ ...editForm, avg_pickup_time: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-edit-pickup-time"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-dropoff-time" className="text-right">
                    Dropoff Time (min)
                  </Label>
                  <Input
                    id="edit-dropoff-time"
                    type="number"
                    value={editForm.avg_dropoff_time || ''}
                    onChange={(e) => setEditForm({ ...editForm, avg_dropoff_time: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-edit-dropoff-time"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-speed" className="text-right">
                    Avg Speed (mph)
                  </Label>
                  <Input
                    id="edit-speed"
                    type="number"
                    value={editForm.avg_speed || ''}
                    onChange={(e) => setEditForm({ ...editForm, avg_speed: parseFloat(e.target.value) })}
                    className="col-span-3"
                    placeholder="Optional"
                    data-testid="input-edit-speed"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="edit-notes" className="text-right">
                    Notes
                  </Label>
                  <Textarea
                    id="edit-notes"
                    value={editForm.notes || ''}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    className="col-span-3"
                    placeholder="Optional notes"
                    data-testid="input-edit-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button onClick={handleSave} data-testid="button-update-route">
                  Update Route
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center mb-4">
            <Input
              placeholder="Search routes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
              data-testid="input-search"
            />
            {selectedRoutes.size > 0 && (
              <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" data-testid="button-bulk-delete">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete Selected ({selectedRoutes.size})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Contracted Routes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete {selectedRoutes.size} contracted route(s)?
                      This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground">
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">
                    <Checkbox
                      checked={filteredRoutes.length > 0 && selectedRoutes.size === filteredRoutes.length}
                      onCheckedChange={handleSelectAll}
                      data-testid="checkbox-select-all"
                    />
                  </TableHead>
                  <TableHead>Route Name</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Dropoff</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>Rate</TableHead>
                  <TableHead>Rate Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRoutes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      No contracted routes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRoutes.map((route) => (
                    <TableRow key={route.route_id} data-testid={`row-route-${route.route_id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedRoutes.has(route.route_id)}
                          onCheckedChange={(checked) => handleSelectRoute(route.route_id, !!checked)}
                          data-testid={`checkbox-route-${route.route_id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <span className="font-medium">{route.route_name}</span>
                        {route.is_custom && (
                          <Badge variant="secondary" className="ml-2" data-testid={`badge-custom-${route.route_id}`}>
                            Custom
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {route.customer_id ? (
                          customers.find(c => c.customer_id === route.customer_id)?.customer_name || 
                          <span className="text-muted-foreground">Unknown</span>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getLocationName(route.pickup_location_id)}
                      </TableCell>
                      <TableCell>
                        {getLocationName(route.dropoff_location_id)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{route.product_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {`${route.avg_volume} ${getVolumeUnit(route.product_type)}`}
                      </TableCell>
                      <TableCell>
                        {`$${route.rate_per_unit.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
                        {getRateTypeDisplay(route.rate_type)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(route)}
                            data-testid={`button-edit-${route.route_id}`}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => verifyAndExecute(() => deleteMutation.mutate(route.route_id))}
                            data-testid={`button-delete-${route.route_id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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