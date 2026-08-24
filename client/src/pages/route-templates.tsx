import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Edit, Trash2, Map } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { RouteTemplate, InsertRouteTemplate, Location } from "@shared/schema";
import { insertRouteTemplateSchema } from "@shared/schema";

export function RouteTemplatesManager() {
  const { toast } = useToast();
  const [editingTemplate, setEditingTemplate] = useState<RouteTemplate | null>(null);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  // Form for adding/editing route templates
  const templateForm = useForm<InsertRouteTemplate>({
    resolver: zodResolver(insertRouteTemplateSchema),
    defaultValues: {
      template_name: "",
      from_location_id: "",
      to_location_id: "",
      distance_miles: 0,
      drive_time_minutes: 0,
      route_description: "",
      is_active: true,
      notes: "",
    },
  });

  const { data: templates = [] } = useQuery<RouteTemplate[]>({
    queryKey: ['/api/route-templates'],
  });

  const { data: locations = [] } = useQuery<Location[]>({
    queryKey: ['/api/locations'],
    select: (data) => [...data].sort((a, b) => a.name.localeCompare(b.name)),
  });

  const createTemplateMutation = useMutation({
    mutationFn: (data: InsertRouteTemplate) => apiRequest('POST', '/api/route-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/route-templates'] });
      toast({ title: "Route template created successfully" });
      setTemplateDialogOpen(false);
      templateForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error creating route template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: ({ template_id, ...data }: Partial<RouteTemplate>) => 
      apiRequest('PATCH', `/api/route-templates/${template_id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/route-templates'] });
      toast({ title: "Route template updated successfully" });
      setEditingTemplate(null);
      setTemplateDialogOpen(false);
      templateForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error updating route template",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (template_id: string) => apiRequest('DELETE', `/api/route-templates/${template_id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/route-templates'] });
      toast({ title: "Route template deleted successfully" });
    },
  });

  const handleTemplateSubmit = (data: InsertRouteTemplate) => {
    if (editingTemplate) {
      updateTemplateMutation.mutate({ ...data, template_id: editingTemplate.template_id });
    } else {
      createTemplateMutation.mutate(data);
    }
  };

  const handleEditTemplate = (template: RouteTemplate) => {
    setEditingTemplate(template);
    templateForm.reset({
      template_name: template.template_name,
      from_location_id: template.from_location_id,
      to_location_id: template.to_location_id,
      distance_miles: template.distance_miles,
      drive_time_minutes: template.drive_time_minutes,
      route_description: template.route_description,
      is_active: template.is_active,
      notes: template.notes,
    });
    setTemplateDialogOpen(true);
  };

  const handleToggleSelect = (templateId: string) => {
    const newSelected = new Set(selectedTemplates);
    if (newSelected.has(templateId)) {
      newSelected.delete(templateId);
    } else {
      newSelected.add(templateId);
    }
    setSelectedTemplates(newSelected);
  };

  const handleBulkDelete = async () => {
    try {
      await apiRequest('DELETE', '/api/route-templates/bulk', {
        template_ids: Array.from(selectedTemplates)
      });
      queryClient.invalidateQueries({ queryKey: ['/api/route-templates'] });
      toast({ title: `${selectedTemplates.size} templates deleted successfully` });
      setSelectedTemplates(new Set());
      setBulkDeleteDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error deleting templates",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  return (
    <Card className="card-metallic">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-card-foreground flex items-center gap-2">
              <Map className="w-5 h-5 text-primary" />
              Route Templates
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Save preferred routes for common segments
            </p>
          </div>
          <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/90" onClick={() => {
                setEditingTemplate(null);
                templateForm.reset();
              }}>
                <Plus className="w-4 h-4 mr-2" />
                New Template
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingTemplate ? 'Edit Route Template' : 'Create New Route Template'}</DialogTitle>
              </DialogHeader>
              <Form {...templateForm}>
                <form onSubmit={templateForm.handleSubmit(handleTemplateSubmit)} className="space-y-4">
                  <FormField
                    control={templateForm.control}
                    name="template_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Mt Poso to Chemoil - Highway 99" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={templateForm.control}
                      name="from_location_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>From Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locations.map(loc => (
                                <SelectItem key={loc.location_id} value={loc.location_id}>
                                  {loc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={templateForm.control}
                      name="to_location_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>To Location</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select location" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {locations.map(loc => (
                                <SelectItem key={loc.location_id} value={loc.location_id}>
                                  {loc.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={templateForm.control}
                      name="distance_miles"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Distance (miles)</FormLabel>
                          <FormControl>
                            <Input type="number" step="0.1" {...field} onChange={e => field.onChange(parseFloat(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={templateForm.control}
                      name="drive_time_minutes"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Drive Time (minutes)</FormLabel>
                          <FormControl>
                            <Input type="number" {...field} onChange={e => field.onChange(parseInt(e.target.value))} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={templateForm.control}
                    name="route_description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Route Description</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="e.g., Highway 99 North to Highway 58 West" 
                            className="resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={templateForm.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Any special instructions or considerations" 
                            className="resize-none" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit">
                      {editingTemplate ? 'Update' : 'Create'} Template
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {selectedTemplates.size > 0 && (
          <div className="mb-4">
            <Button 
              variant="destructive" 
              onClick={() => setBulkDeleteDialogOpen(true)}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedTemplates.size})
            </Button>
          </div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={selectedTemplates.size === templates.length && templates.length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedTemplates(new Set(templates.map(t => t.template_id)));
                      } else {
                        setSelectedTemplates(new Set());
                      }
                    }}
                  />
                </TableHead>
                <TableHead>Template Name</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Distance</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((template) => {
                const fromLocation = locations.find(l => l.location_id === template.from_location_id);
                const toLocation = locations.find(l => l.location_id === template.to_location_id);
                
                return (
                  <TableRow key={template.template_id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedTemplates.has(template.template_id)}
                        onCheckedChange={() => handleToggleSelect(template.template_id)}
                      />
                    </TableCell>
                    <TableCell className="font-medium">{template.template_name}</TableCell>
                    <TableCell>{fromLocation?.name || template.from_location_id}</TableCell>
                    <TableCell>{toLocation?.name || template.to_location_id}</TableCell>
                    <TableCell>{template.distance_miles.toFixed(1)} mi</TableCell>
                    <TableCell>{template.drive_time_minutes} min</TableCell>
                    <TableCell>
                      <Badge className={template.is_active ? "bg-primary" : "bg-gray-500"}>
                        {template.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleEditTemplate(template)}
                          data-testid={`button-edit-template-${template.template_id}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteTemplateMutation.mutate(template.template_id)}
                          data-testid={`button-delete-template-${template.template_id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No route templates yet. Create one to save preferred routes.
            </div>
          )}
        </div>
        <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Route Templates</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete {selectedTemplates.size} selected route template{selectedTemplates.size === 1 ? '' : 's'}? 
                This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleBulkDelete}>
                Delete Templates
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}