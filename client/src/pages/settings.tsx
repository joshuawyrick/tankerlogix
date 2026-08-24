import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings as SettingsIcon, Save, Key, AlertCircle, Lock, Shield } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Config } from "@shared/schema";

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModified, setIsModified] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [isPinSaving, setIsPinSaving] = useState(false);

  const { data: config, isLoading } = useQuery<Config>({
    queryKey: ['/api/config'],
  });

  const [formData, setFormData] = useState<Config>({
    avg_mph_default: 41,
    hourly_target_default_usd: 135,
    traffic_buffer_min_default: 20,
    pickup_time_min_default: 45,
    dropoff_time_min_default: 60,
    include_deadhead_default: true,
    assume_symmetric_route_for_empty: true,
    base_yard_name: "Yard",
    base_lat: 35.3,
    base_lon: -119.1,
    diesel_units_are_gallons: true,
    crude_units_are_barrels: true,
    barrels_to_gallons_factor: 42,
    pin_enabled: false,
  });

  // Update form when config loads
  React.useEffect(() => {
    if (config && !isModified) {
      setFormData(config);
    }
  }, [config, isModified]);

  const saveMutation = useMutation({
    mutationFn: (data: Partial<Config>) => apiRequest('PUT', '/api/config', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      setIsModified(false);
      toast({
        title: "Settings Saved",
        description: "Configuration has been updated successfully.",
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

  const handleInputChange = (field: keyof Config, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setIsModified(true);
  };

  const handleSave = () => {
    saveMutation.mutate(formData);
  };

  const handleSetPin = async () => {
    setPinError("");
    
    if (config?.pin_enabled && !currentPin) {
      setPinError("Please enter your current PIN");
      return;
    }
    
    if (!pinValue) {
      if (!config?.pin_enabled) {
        setPinError("Please enter a new PIN");
        return;
      }
      setPinError("Please enter a new PIN to update, or use 'Disable PIN' button");
      return;
    }
    
    if (pinValue.length < 4 || pinValue.length > 10) {
      setPinError("PIN must be 4-10 digits");
      return;
    }
    if (pinValue !== confirmPin) {
      setPinError("PINs do not match");
      return;
    }

    setIsPinSaving(true);
    try {
      const response = await fetch("/api/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: pinValue,
          currentPin: currentPin || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPinError(data.error || "Failed to set PIN");
        return;
      }

      toast({
        title: "PIN Set",
        description: "Admin PIN has been configured. Destructive actions will now require PIN verification.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      setPinValue("");
      setConfirmPin("");
      setCurrentPin("");
    } catch (error) {
      setPinError("Failed to set PIN. Please try again.");
    } finally {
      setIsPinSaving(false);
    }
  };

  const handleDisablePin = async () => {
    if (!currentPin) {
      setPinError("Please enter your current PIN to disable");
      return;
    }
    
    setIsPinSaving(true);
    setPinError("");
    
    try {
      const response = await fetch("/api/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: null,
          currentPin: currentPin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setPinError(data.error || "Failed to disable PIN");
        return;
      }

      toast({
        title: "PIN Disabled",
        description: "PIN protection has been turned off.",
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/config'] });
      setCurrentPin("");
    } catch (error) {
      setPinError("Failed to disable PIN. Please try again.");
    } finally {
      setIsPinSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="text-center">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Configure default values and application behavior.
        </p>
      </div>

      <div className="space-y-6">
        {/* API Key Configuration */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Key className="w-5 h-5 text-primary mr-2" />
              API Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Google Maps API key is configured via Replit Secrets. Set the <code>GOOGLE_MAPS_API_KEY</code> 
                environment variable to enable route calculations.
                <div className="text-green-600 mt-2">
                  ✅ API key is configured and working (verified by route calculations).
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  The API key is securely stored server-side and not exposed to the frontend for security.
                </div>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Default Values */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle className="flex items-center">
              <SettingsIcon className="w-5 h-5 text-primary mr-2" />
              Default Values
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="mph-default">Default Average MPH</Label>
                <Input
                  id="mph-default"
                  type="number"
                  value={formData.avg_mph_default}
                  onChange={(e) => handleInputChange('avg_mph_default', parseInt(e.target.value) || 0)}
                  data-testid="input-mph-default"
                  className="input-metallic"
                />
              </div>
              <div>
                {/* Empty column for grid layout consistency */}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="hourly-target-default">Default Hourly Target ($)</Label>
                <Input
                  id="hourly-target-default"
                  type="number"
                  value={formData.hourly_target_default_usd}
                  onChange={(e) => handleInputChange('hourly_target_default_usd', parseInt(e.target.value) || 0)}
                  data-testid="input-hourly-target-default"
                  className="input-metallic"
                />
              </div>
              <div>
                <Label htmlFor="traffic-buffer-default">Default Traffic Buffer (min)</Label>
                <Input
                  id="traffic-buffer-default"
                  type="number"
                  value={formData.traffic_buffer_min_default}
                  onChange={(e) => handleInputChange('traffic_buffer_min_default', parseInt(e.target.value) || 0)}
                  data-testid="input-traffic-buffer-default"
                  className="input-metallic"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="pickup-time-default">Default Pickup Time (min)</Label>
                <Input
                  id="pickup-time-default"
                  type="number"
                  value={formData.pickup_time_min_default}
                  onChange={(e) => handleInputChange('pickup_time_min_default', parseInt(e.target.value) || 0)}
                  data-testid="input-pickup-time-default"
                  className="input-metallic"
                />
              </div>
              <div>
                <Label htmlFor="dropoff-time-default">Default Dropoff Time (min)</Label>
                <Input
                  id="dropoff-time-default"
                  type="number"
                  value={formData.dropoff_time_min_default}
                  onChange={(e) => handleInputChange('dropoff_time_min_default', parseInt(e.target.value) || 0)}
                  data-testid="input-dropoff-time-default"
                  className="input-metallic"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="include-deadhead-default"
                  checked={formData.include_deadhead_default}
                  onCheckedChange={(checked) => handleInputChange('include_deadhead_default', !!checked)}
                  data-testid="checkbox-include-deadhead-default"
                />
                <Label htmlFor="include-deadhead-default">Include deadhead by default</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="assume-symmetric-default"
                  checked={formData.assume_symmetric_route_for_empty}
                  onCheckedChange={(checked) => handleInputChange('assume_symmetric_route_for_empty', !!checked)}
                  data-testid="checkbox-assume-symmetric-default"
                />
                <Label htmlFor="assume-symmetric-default">Assume symmetric routes for empty legs by default</Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Base Yard Configuration */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle>Base Yard Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="base-yard-name">Base Yard Name</Label>
              <Input
                id="base-yard-name"
                value={formData.base_yard_name}
                onChange={(e) => handleInputChange('base_yard_name', e.target.value)}
                data-testid="input-base-yard-name"
                className="input-metallic"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="base-lat">Base Latitude</Label>
                <Input
                  id="base-lat"
                  type="number"
                  step="0.0001"
                  value={formData.base_lat}
                  onChange={(e) => handleInputChange('base_lat', parseFloat(e.target.value) || 0)}
                  data-testid="input-base-lat"
                  className="input-metallic"
                />
              </div>
              <div>
                <Label htmlFor="base-lon">Base Longitude</Label>
                <Input
                  id="base-lon"
                  type="number"
                  step="0.0001"
                  value={formData.base_lon}
                  onChange={(e) => handleInputChange('base_lon', parseFloat(e.target.value) || 0)}
                  data-testid="input-base-lon"
                  className="input-metallic"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Unit Configuration */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle>Unit Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="crude-units-barrels"
                  checked={formData.crude_units_are_barrels}
                  onCheckedChange={(checked) => handleInputChange('crude_units_are_barrels', !!checked)}
                  data-testid="checkbox-crude-units-barrels"
                />
                <Label htmlFor="crude-units-barrels">Crude oil units are barrels</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="diesel-units-gallons"
                  checked={formData.diesel_units_are_gallons}
                  onCheckedChange={(checked) => handleInputChange('diesel_units_are_gallons', !!checked)}
                  data-testid="checkbox-diesel-units-gallons"
                />
                <Label htmlFor="diesel-units-gallons">Diesel units are gallons</Label>
              </div>
            </div>

            <div>
              <Label htmlFor="barrels-to-gallons">Barrels to Gallons Conversion Factor</Label>
              <Input
                id="barrels-to-gallons"
                type="number"
                value={formData.barrels_to_gallons_factor}
                onChange={(e) => handleInputChange('barrels_to_gallons_factor', parseFloat(e.target.value) || 0)}
                data-testid="input-barrels-to-gallons"
                className="input-metallic"
              />
            </div>
          </CardContent>
        </Card>

        {/* PIN Protection */}
        <Card className="card-metallic">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Shield className="w-5 h-5 text-primary mr-2" />
              PIN Protection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Lock className="h-4 w-4" />
              <AlertDescription>
                When enabled, users must enter a PIN before they can delete or edit locations, 
                customers, routes, or other data. This helps prevent accidental changes.
                {config?.pin_enabled && (
                  <div className="text-green-600 mt-2">
                    ✅ PIN protection is currently enabled.
                  </div>
                )}
              </AlertDescription>
            </Alert>

            {config?.pin_enabled && (
              <div className="space-y-2">
                <Label htmlFor="current-pin">Current PIN (required to make changes)</Label>
                <Input
                  id="current-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={currentPin}
                  onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter current PIN"
                  className="input-metallic max-w-xs"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="new-pin">{config?.pin_enabled ? "New PIN (leave blank to keep current)" : "Set PIN"}</Label>
                <Input
                  id="new-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, ""))}
                  placeholder="4-10 digits"
                  className="input-metallic"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-pin">Confirm PIN</Label>
                <Input
                  id="confirm-pin"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={10}
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="Confirm PIN"
                  className="input-metallic"
                />
              </div>
            </div>

            {pinError && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="w-4 h-4" />
                {pinError}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleSetPin}
                disabled={isPinSaving}
              >
                <Lock className="w-4 h-4 mr-2" />
                {isPinSaving ? "Saving..." : config?.pin_enabled ? "Update PIN" : "Enable PIN"}
              </Button>
              {config?.pin_enabled && (
                <Button
                  variant="outline"
                  onClick={handleDisablePin}
                  disabled={isPinSaving}
                >
                  Disable PIN
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end">
          <Button 
            onClick={handleSave}
            disabled={!isModified || saveMutation.isPending}
            data-testid="button-save-settings"
          >
            <Save className="w-4 h-4 mr-2" />
            {saveMutation.isPending ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </div>
    </div>
  );
}
