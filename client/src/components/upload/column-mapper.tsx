import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CheckCircle, AlertCircle, ArrowRight } from "lucide-react";

interface ColumnMappingProps {
  fileType: string;
  detectedColumns: string[];
  sampleData: Record<string, any>[];
  onMappingComplete: (mapping: Record<string, string>) => void;
  onCancel: () => void;
}

const FIELD_MAPPINGS = {
  locations: {
    required: [
      { field: 'name', label: 'Location Name', description: 'Human-readable location name' },
      { field: 'role', label: 'Role', description: 'pickup, dropoff, or both' },
      { field: 'lat', label: 'Latitude', description: 'Latitude coordinate (32-42 for CA)' },
      { field: 'lon', label: 'Longitude', description: 'Longitude coordinate (-125 to -114 for CA)' },
    ],
    optional: [
      { field: 'location_id', label: 'Location ID', description: 'Auto-generated if not provided' },
      { field: 'allowed_load_types', label: 'Allowed Load Types', description: 'crude, diesel, or crude,diesel' },
      { field: 'default_units_loaded', label: 'Default Units', description: 'Default number of units to load' },
      { field: 'default_pickup_min', label: 'Pickup Time (min)', description: 'Default pickup time in minutes' },
      { field: 'default_dropoff_min', label: 'Dropoff Time (min)', description: 'Default dropoff time in minutes' },
      { field: 'pickup_queue_min', label: 'Pickup Queue (min)', description: 'Queue time at pickup' },
      { field: 'dropoff_queue_min', label: 'Dropoff Queue (min)', description: 'Queue time at dropoff' },
      { field: 'api_gravity', label: 'API Gravity', description: 'Oil density measurement' },
      { field: 'notes', label: 'Notes', description: 'Additional notes or comments' },
    ],
  },
  overrides: {
    required: [
      { field: 'pickup_location_id', label: 'Pickup Location ID', description: 'ID of pickup location' },
      { field: 'dropoff_location_id', label: 'Dropoff Location ID', description: 'ID of dropoff location' },
    ],
    optional: [
      { field: 'mph_loaded_override', label: 'MPH Loaded Override', description: 'Override loaded speed' },
      { field: 'mph_empty_override', label: 'MPH Empty Override', description: 'Override empty speed' },
      { field: 'default_units_loaded_override', label: 'Units Override', description: 'Override default units' },
      { field: 'notes', label: 'Notes', description: 'Additional notes or comments' },
    ],
  },
  config: {
    required: [],
    optional: [
      { field: 'avg_mph_loaded_default', label: 'Default MPH Loaded', description: 'Default speed when loaded' },
      { field: 'avg_mph_empty_default', label: 'Default MPH Empty', description: 'Default speed when empty' },
      { field: 'hourly_target_default_usd', label: 'Default Hourly Target', description: 'Default hourly rate target' },
      { field: 'traffic_buffer_min_default', label: 'Default Traffic Buffer', description: 'Default traffic buffer in minutes' },
      { field: 'base_yard_name', label: 'Base Yard Name', description: 'Name of the base yard' },
      { field: 'base_lat', label: 'Base Latitude', description: 'Base yard latitude' },
      { field: 'base_lon', label: 'Base Longitude', description: 'Base yard longitude' },
      { field: 'barrels_to_gallons_factor', label: 'Barrels to Gallons Factor', description: 'Conversion factor' },
    ],
  },
};

export default function ColumnMapper({ 
  fileType, 
  detectedColumns, 
  sampleData, 
  onMappingComplete, 
  onCancel 
}: ColumnMappingProps) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoMapped, setAutoMapped] = useState<string[]>([]);

  const fieldConfig = FIELD_MAPPINGS[fileType as keyof typeof FIELD_MAPPINGS];
  
  if (!fieldConfig) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Unknown file type: {fileType}
        </AlertDescription>
      </Alert>
    );
  }

  // Auto-map obvious matches on first render
  useState(() => {
    const autoMapping: Record<string, string> = {};
    const mapped: string[] = [];
    
    [...fieldConfig.required, ...fieldConfig.optional].forEach(({ field, label }) => {
      // Try exact match first
      const exactMatch = detectedColumns.find(col => 
        col.toLowerCase() === field.toLowerCase()
      );
      
      if (exactMatch) {
        autoMapping[field] = exactMatch;
        mapped.push(field);
        return;
      }
      
      // Try partial matches for common variations
      const partialMatch = detectedColumns.find(col => {
        const colLower = col.toLowerCase().replace(/[_\s-]/g, '');
        const fieldLower = field.toLowerCase().replace(/[_\s-]/g, '');
        
        // Check if column contains the field name or vice versa
        return colLower.includes(fieldLower) || fieldLower.includes(colLower) ||
               // Common aliases
               (field === 'lat' && (col.toLowerCase().includes('latitude'))) ||
               (field === 'lon' && (col.toLowerCase().includes('longitude') || col.toLowerCase().includes('lng'))) ||
               (field === 'name' && (col.toLowerCase().includes('location') && col.toLowerCase().includes('name')));
      });
      
      if (partialMatch) {
        autoMapping[field] = partialMatch;
        mapped.push(field);
      }
    });
    
    setMapping(autoMapping);
    setAutoMapped(mapped);
  });

  const handleMappingChange = (field: string, column: string) => {
    setMapping(prev => {
      if (column === '') {
        const { [field]: removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [field]: column };
    });
  };

  const getUsedColumns = () => {
    return Object.values(mapping).filter(Boolean);
  };

  const getAvailableColumns = (currentField?: string) => {
    const used = getUsedColumns();
    const currentValue = currentField ? mapping[currentField] : undefined;
    
    return detectedColumns.filter(col => 
      !used.includes(col) || col === currentValue
    );
  };

  const getMappingStatus = () => {
    const requiredFields = fieldConfig.required;
    const mappedRequired = requiredFields.filter(field => mapping[field.field]);
    
    return {
      requiredMapped: mappedRequired.length,
      requiredTotal: requiredFields.length,
      isComplete: mappedRequired.length === requiredFields.length,
    };
  };

  const status = getMappingStatus();

  const handleComplete = () => {
    if (status.isComplete) {
      onMappingComplete(mapping);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Column Mapping
            <Badge variant={status.isComplete ? "default" : "secondary"}>
              {status.requiredMapped}/{status.requiredTotal} Required Fields
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Map your CSV columns to the expected fields. Required fields must be mapped to proceed.
              {autoMapped.length > 0 && (
                <div className="mt-2">
                  <strong>Auto-mapped:</strong> {autoMapped.join(', ')}
                </div>
              )}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mapping Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Field Mapping</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* Required Fields */}
              {fieldConfig.required.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-3 text-destructive">
                    Required Fields *
                  </h4>
                  <div className="space-y-3">
                    {fieldConfig.required.map(({ field, label, description }) => (
                      <div key={field} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-sm font-medium">{label}</label>
                          {mapping[field] && (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          )}
                        </div>
                        <Select
                          value={mapping[field] || ""}
                          onValueChange={(value) => handleMappingChange(field, value)}
                        >
                          <SelectTrigger 
                            className={!mapping[field] ? "border-destructive" : ""}
                            data-testid={`select-${field}`}
                          >
                            <SelectValue placeholder="Select column..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">-- No mapping --</SelectItem>
                            {getAvailableColumns(field).map(column => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Fields */}
              {fieldConfig.optional.length > 0 && (
                <div>
                  <h4 className="font-medium text-sm mb-3">Optional Fields</h4>
                  <div className="space-y-3">
                    {fieldConfig.optional.map(({ field, label, description }) => (
                      <div key={field} className="space-y-1">
                        <label className="text-sm font-medium">{label}</label>
                        <Select
                          value={mapping[field] || ""}
                          onValueChange={(value) => handleMappingChange(field, value)}
                        >
                          <SelectTrigger data-testid={`select-${field}`}>
                            <SelectValue placeholder="Select column..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="">-- No mapping --</SelectItem>
                            {getAvailableColumns(field).map(column => (
                              <SelectItem key={column} value={column}>
                                {column}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
          </CardHeader>
          <CardContent>
            {sampleData.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>
                        <ArrowRight className="h-4 w-4" />
                      </TableHead>
                      <TableHead>Sample Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(mapping)
                      .filter(([_, column]) => column)
                      .map(([field, column]) => (
                        <TableRow key={field}>
                          <TableCell className="font-medium">{field}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{column}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {sampleData[0]?.[column] || 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-4">
                No sample data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onCancel} data-testid="button-cancel-mapping">
          Cancel
        </Button>
        <Button 
          onClick={handleComplete}
          disabled={!status.isComplete}
          data-testid="button-complete-mapping"
        >
          {status.isComplete ? 'Proceed with Import' : `Map ${status.requiredTotal - status.requiredMapped} More Required Fields`}
        </Button>
      </div>
    </div>
  );
}
