import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PinVerificationModal, usePinVerification } from "@/components/pin-verification-modal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Pencil, Download, Upload, Users, AlertCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertCustomerSchema, type Customer, type InsertCustomer } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import * as XLSX from "xlsx";

export default function CustomersPage() {
  const { toast } = useToast();
  const { showModal, setShowModal, verifyAndExecute, handleVerified } = usePinVerification();
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isBulkUploadOpen, setIsBulkUploadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Query for customers
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (data: InsertCustomer) =>
      apiRequest("POST", "/api/customers", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracted-routes"] });
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
      setIsAddDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<InsertCustomer> }) =>
      apiRequest("PATCH", `/api/customers/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracted-routes"] });
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      apiRequest("DELETE", `/api/customers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracted-routes"] });
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setSelectedCustomers(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) =>
      apiRequest("DELETE", "/api/customers/bulk", { ids }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/contracted-routes"] });
      toast({
        title: "Success",
        description: `Deleted ${data.deleted} customers`,
      });
      setSelectedCustomers(new Set());
      setIsDeleteDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customers",
        variant: "destructive",
      });
    },
  });

  // Bulk upload mutation
  const bulkUploadMutation = useMutation({
    mutationFn: async (customers: InsertCustomer[]) => {
      const results = await Promise.allSettled(
        customers.map(customer =>
          apiRequest("POST", "/api/customers", customer)
        )
      );
      
      const successful = results.filter(r => r.status === "fulfilled").length;
      const failed = results.filter(r => r.status === "rejected").length;
      
      return { successful, failed };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Import Complete",
        description: `Successfully imported ${data.successful} customers${data.failed > 0 ? `, ${data.failed} failed` : ""}`,
      });
      setIsBulkUploadOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to import customers",
        variant: "destructive",
      });
    },
  });

  const form = useForm<InsertCustomer>({
    resolver: zodResolver(insertCustomerSchema),
    defaultValues: {
      customer_name: "",
      customer_code: "",
      notes: "",
    },
  });

  const editForm = useForm<InsertCustomer>({
    resolver: zodResolver(insertCustomerSchema.partial()),
    defaultValues: {
      customer_name: "",
      customer_code: "",
      notes: "",
    },
  });

  const handleAddCustomer = (data: InsertCustomer) => {
    createMutation.mutate(data);
  };

  const handleEditCustomer = (data: InsertCustomer) => {
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.customer_id, data });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedCustomers.size === 0) return;
    verifyAndExecute(() => {
      bulkDeleteMutation.mutate(Array.from(selectedCustomers));
    });
  };

  const handleExportCustomers = () => {
    const exportData = customers.map(customer => ({
      "Customer Name": customer.customer_name,
      "Customer Code": customer.customer_code,
      "Notes": customer.notes || "",
      "Created At": new Date(customer.created_at).toLocaleDateString(),
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customers");
    
    // Column widths
    ws['!cols'] = [
      { wch: 30 }, // Customer Name
      { wch: 15 }, // Customer Code
      { wch: 40 }, // Notes
      { wch: 15 }, // Created At
    ];
    
    XLSX.writeFile(wb, `customers_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Export Complete",
      description: `Exported ${customers.length} customers`,
    });
  };

  const handleFileUpload = (parsedData: any[]) => {
    const validCustomers: InsertCustomer[] = [];
    const errors: string[] = [];

    parsedData.forEach((row, index) => {
      try {
        // Map various possible column names
        const customerData: InsertCustomer = {
          customer_name: row["Customer Name"] || row["Name"] || row["customer_name"] || "",
          customer_code: row["Customer Code"] || row["Code"] || row["customer_code"] || "",
          notes: row["Notes"] || row["notes"] || "",
        };

        // Validate
        const validated = insertCustomerSchema.parse(customerData);
        
        // Check if customer code already exists
        const existingCustomer = customers.find(
          c => c.customer_code.toUpperCase() === validated.customer_code.toUpperCase()
        );
        
        if (existingCustomer) {
          errors.push(`Row ${index + 2}: Customer code "${validated.customer_code}" already exists`);
        } else {
          validCustomers.push(validated);
        }
      } catch (error: any) {
        errors.push(`Row ${index + 2}: ${error.message}`);
      }
    });

    if (errors.length > 0) {
      toast({
        title: "Validation Errors",
        description: errors.slice(0, 5).join("\n") + (errors.length > 5 ? `\n... and ${errors.length - 5} more` : ""),
        variant: "destructive",
      });
    }

    if (validCustomers.length > 0) {
      bulkUploadMutation.mutate(validCustomers);
    }
  };

  const filteredCustomers = customers.filter(customer =>
    customer.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    customer.customer_code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleCustomerSelection = (customerId: string) => {
    const newSelection = new Set(selectedCustomers);
    if (newSelection.has(customerId)) {
      newSelection.delete(customerId);
    } else {
      newSelection.add(customerId);
    }
    setSelectedCustomers(newSelection);
  };

  const toggleAllSelection = () => {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.customer_id)));
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex justify-center items-center h-64">
          <div className="text-muted-foreground">Loading customers...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Users className="h-8 w-8 text-primary" />
            Customer Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage customers for contracted routes
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setIsBulkUploadOpen(true)}
            data-testid="button-bulk-upload"
          >
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
          <Button
            variant="outline"
            onClick={handleExportCustomers}
            disabled={customers.length === 0}
            data-testid="button-export"
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button 
            onClick={() => setIsAddDialogOpen(true)}
            data-testid="button-add-customer"
          >
            <Users className="h-4 w-4 mr-2" />
            Add Customer
          </Button>
        </div>
      </div>

      <Card className="p-6">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-4 flex-1">
            <Input
              placeholder="Search customers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
              data-testid="input-search"
            />
            <div className="text-sm text-muted-foreground">
              {filteredCustomers.length} of {customers.length} customers
            </div>
          </div>
          {selectedCustomers.size > 0 && (
            <Button
              variant="destructive"
              onClick={() => setIsDeleteDialogOpen(true)}
              data-testid="button-delete-selected"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Selected ({selectedCustomers.size})
            </Button>
          )}
        </div>

        {customers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No customers found. Add your first customer to get started.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0}
                    onCheckedChange={toggleAllSelection}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Customer Code</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.map((customer) => (
                <TableRow key={customer.customer_id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedCustomers.has(customer.customer_id)}
                      onCheckedChange={() => toggleCustomerSelection(customer.customer_id)}
                      data-testid={`checkbox-select-${customer.customer_id}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium" data-testid={`text-name-${customer.customer_id}`}>
                    {customer.customer_name}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                      {customer.customer_code}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-xs truncate" data-testid={`text-notes-${customer.customer_id}`}>
                    {customer.notes || "-"}
                  </TableCell>
                  <TableCell>
                    {new Date(customer.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingCustomer(customer);
                        editForm.reset({
                          customer_name: customer.customer_name,
                          customer_code: customer.customer_code,
                          notes: customer.notes || "",
                        });
                        setIsEditDialogOpen(true);
                      }}
                      data-testid={`button-edit-${customer.customer_id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setSelectedCustomers(new Set([customer.customer_id]));
                        setIsDeleteDialogOpen(true);
                      }}
                      data-testid={`button-delete-${customer.customer_id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      {/* Add Customer Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent data-testid="dialog-add-customer">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Create a new customer for contracted routes
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleAddCustomer)} className="space-y-4">
              <FormField
                control={form.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ABC Transport Co." data-testid="input-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customer_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Code</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="ABC001" className="uppercase" data-testid="input-customer-code" />
                    </FormControl>
                    <FormDescription>
                      Unique code for this customer (will be converted to uppercase)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Additional notes about this customer..."
                        rows={3}
                        data-testid="textarea-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending} data-testid="button-submit-add">
                  {createMutation.isPending ? "Creating..." : "Create Customer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent data-testid="dialog-edit-customer">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
            <DialogDescription>
              Update customer information
            </DialogDescription>
          </DialogHeader>
          <Form {...editForm}>
            <form onSubmit={editForm.handleSubmit(handleEditCustomer)} className="space-y-4">
              <FormField
                control={editForm.control}
                name="customer_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-edit-customer-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="customer_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Code</FormLabel>
                    <FormControl>
                      <Input {...field} className="uppercase" data-testid="input-edit-customer-code" />
                    </FormControl>
                    <FormDescription>
                      Unique code for this customer (will be converted to uppercase)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        rows={3}
                        data-testid="textarea-edit-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMutation.isPending} data-testid="button-submit-edit">
                  {updateMutation.isPending ? "Updating..." : "Update Customer"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-confirm">
          <DialogHeader>
            <DialogTitle>Confirm Deletion</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedCustomers.size} customer{selectedCustomers.size !== 1 ? "s" : ""}?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <Alert className="border-destructive/50 bg-destructive/10">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="text-destructive">
              Warning: Customers that have contracted routes assigned to them cannot be deleted.
            </AlertDescription>
          </Alert>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={bulkDeleteMutation.isPending || deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {bulkDeleteMutation.isPending || deleteMutation.isPending
                ? "Deleting..."
                : `Delete ${selectedCustomers.size} Customer${selectedCustomers.size !== 1 ? "s" : ""}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Upload Dialog */}
      <Dialog open={isBulkUploadOpen} onOpenChange={setIsBulkUploadOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-bulk-upload">
          <DialogHeader>
            <DialogTitle>Bulk Import Customers</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to import multiple customers at once
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>File format requirements:</strong>
                <ul className="mt-2 space-y-1 text-sm">
                  <li>• Column headers: "Customer Name", "Customer Code", "Notes" (optional)</li>
                  <li>• Customer codes must be unique</li>
                  <li>• Duplicate customer codes will be skipped</li>
                </ul>
              </AlertDescription>
            </Alert>
            
            <div className="space-y-4">
              <div className="border-2 border-dashed border-muted-foreground/50 rounded-lg p-6 text-center">
                <Upload className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-sm font-medium">Click to upload or drag and drop</span>
                  <Input
                    id="file-upload"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const data = new Uint8Array(event.target?.result as ArrayBuffer);
                          const workbook = XLSX.read(data, { type: 'array' });
                          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                          const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                          handleFileUpload(jsonData);
                        };
                        reader.readAsArrayBuffer(file);
                      }
                    }}
                    data-testid="input-file-upload"
                  />
                </Label>
                <p className="text-xs text-muted-foreground mt-2">CSV or Excel files only</p>
              </div>
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  const sampleData = [
                    {
                      "Customer Name": "ABC Transport Co.",
                      "Customer Code": "ABC001",
                      "Notes": "Preferred customer for crude oil routes"
                    },
                    {
                      "Customer Name": "XYZ Logistics",
                      "Customer Code": "XYZ002",
                      "Notes": "Diesel specialist"
                    },
                  ];
                  const ws = XLSX.utils.json_to_sheet(sampleData);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Customer Template");
                  XLSX.writeFile(wb, "customer_template.xlsx");
                }}
                data-testid="button-download-template"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
          </div>
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