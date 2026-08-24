import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Upload, FileText, CheckCircle, Download, MapPinOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function FileUploader() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload/locations', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (result) => {
      setUploadResult(result);
      toast({
        title: "Upload Successful",
        description: `Imported ${result.imported || 0} locations successfully.`,
      });
      
      // Invalidate locations query to refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/locations'] });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadResult(null);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      toast({
        title: "Missing Information",
        description: "Please select a file to upload.",
        variant: "destructive",
      });
      return;
    }

    uploadMutation.mutate(selectedFile);
  };

  const handleStartOver = () => {
    setSelectedFile(null);
    setUploadResult(null);
  };

  const downloadTemplate = () => {
    // Create CSV content with user-friendly column names
    const csvContent = [
      // Header row with user-friendly column names
      'name,role,lat,long,product_types,default_volume,pickup_time,dropoff_time,avg_speed,notes',
      // Example rows with helpful data showing unit differences
      '# Example entries below - replace with your actual data',
      'Houston Terminal,pickup,29.7604,-95.3698,crude,180,45,0,35,Primary crude oil terminal - volumes in barrels',
      'Dallas Refinery,dropoff,32.7767,-96.7970,crude,180,0,60,40,Major refinery - accepts crude oil in barrels',
      'Austin Fuel Depot,pickup,30.2672,-97.7431,diesel,7500,30,0,45,Diesel fuel depot - volumes in gallons',
      'San Antonio Station,dropoff,29.4241,-98.4936,diesel,7500,0,45,42,Diesel distribution - volumes in gallons',
      'El Paso Hub,both,31.7619,-106.4850,both,155,40,50,38,Mixed products - enter crude in barrels or diesel in gallons',
      'Midland Yard,yard,31.9973,-102.0779,both,0,0,0,35,Base yard for driver dispatch',
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'locations_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <Card className="card-metallic">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Upload className="w-5 h-5 text-primary mr-2" />
            Upload Location Data
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-2">Template Information</h4>
            <p className="text-sm text-muted-foreground mb-3">
              Use the location template to import pickup points, dropoff locations, yards, and their default settings.
            </p>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Crude Oil:</strong> Default volumes should be entered in <strong>barrels</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Diesel:</strong> Default volumes should be entered in <strong>gallons</strong></span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Product Types:</strong> Use "crude", "diesel", or "both"</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-primary">•</span>
                <span><strong>Roles:</strong> Use "pickup", "dropoff", "both", or "yard"</span>
              </div>
            </div>
          </div>

          <div>
            <Button 
              variant="outline" 
              onClick={downloadTemplate}
              className="w-full"
              data-testid="button-download-template"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Location Template
            </Button>
          </div>

          <div>
            <Label htmlFor="file-input">Choose File to Upload</Label>
            <Input
              id="file-input"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileChange}
              data-testid="input-file"
              className="input-metallic"
            />
            {selectedFile && (
              <div className="mt-2 flex items-center text-sm text-muted-foreground">
                <FileText className="w-4 h-4 mr-1" />
                {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
              </div>
            )}
          </div>

          <Button 
            variant="metal"
            onClick={handleUpload}
            disabled={!selectedFile || uploadMutation.isPending}
            className="w-full"
            data-testid="button-upload"
          >
            {uploadMutation.isPending ? 'Uploading...' : 'Upload Location File'}
          </Button>
        </CardContent>
      </Card>

      {/* Upload Results */}
      {uploadResult && (
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              Upload Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center flex-wrap gap-2">
              <Badge variant="secondary">
                {uploadResult.imported || 0} Locations Imported
              </Badge>
              {uploadResult.warnings && uploadResult.warnings.length > 0 && (
                <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-600 dark:border-yellow-800">
                  <MapPinOff className="w-3 h-3 mr-1" />
                  {uploadResult.warnings.length} Coordinate Warnings
                </Badge>
              )}
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <Badge variant="destructive">
                  {uploadResult.errors.length} Errors
                </Badge>
              )}
            </div>

            {/* Show warnings about missing coordinates */}
            {uploadResult.warnings && uploadResult.warnings.length > 0 && (
              <Alert className="border-yellow-600/20 bg-yellow-50/50 dark:bg-yellow-900/10">
                <MapPinOff className="h-4 w-4 text-yellow-600" />
                <AlertDescription>
                  <div className="font-medium mb-2 text-yellow-800 dark:text-yellow-600">Locations with Coordinate Warnings:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm text-yellow-700 dark:text-yellow-500">
                    {uploadResult.warnings.slice(0, 10).map((warning: any, index: number) => (
                      <li key={index}>
                        {warning.warning || `${warning.location || `Row ${warning.row}`}: Missing ${warning.missing || 'coordinates'}`}
                      </li>
                    ))}
                    {uploadResult.warnings.length > 10 && (
                      <li>... and {uploadResult.warnings.length - 10} more locations</li>
                    )}
                  </ul>
                  <div className="mt-2 text-xs text-yellow-600 dark:text-yellow-400">
                    You can add GPS coordinates manually in the Locations page, or upload an updated file with lat/long values.
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Show errors if any */}
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <Alert variant="destructive">
                <AlertDescription>
                  <div className="font-medium mb-2">Upload Errors:</div>
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {uploadResult.errors.slice(0, 5).map((error: any, index: number) => (
                      <li key={index}>
                        Row {error.row}: {error.error}
                      </li>
                    ))}
                    {uploadResult.errors.length > 5 && (
                      <li>... and {uploadResult.errors.length - 5} more errors</li>
                    )}
                  </ul>
                </AlertDescription>
              </Alert>
            )}

            <Button variant="outline" onClick={handleStartOver} className="w-full">
              Start Over
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}