import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, AlertCircle } from "lucide-react";

interface PinVerificationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: () => void;
  title?: string;
  description?: string;
}

export function PinVerificationModal({
  open,
  onOpenChange,
  onVerified,
  title = "Enter PIN",
  description = "Please enter your admin PIN to continue with this action."
}: PinVerificationModalProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPin("");
      setError("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleVerify = async () => {
    if (!pin.trim()) {
      setError("Please enter a PIN");
      return;
    }

    setIsVerifying(true);
    setError("");

    try {
      const response = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: pin.trim() }),
      });

      const data = await response.json();

      if (data.valid) {
        onVerified();
        onOpenChange(false);
      } else {
        setError("Incorrect PIN. Please try again.");
        setPin("");
        inputRef.current?.focus();
      }
    } catch {
      setError("Failed to verify PIN. Please try again.");
    } finally {
      setIsVerifying(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleVerify();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="pin">PIN Code</Label>
            <Input
              id="pin"
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={10}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={handleKeyDown}
              placeholder="Enter PIN"
              className="text-center text-xl tracking-widest"
              disabled={isVerifying}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
              disabled={isVerifying}
            >
              Cancel
            </Button>
            <Button
              onClick={handleVerify}
              className="flex-1"
              disabled={isVerifying || !pin.trim()}
            >
              {isVerifying ? "Verifying..." : "Verify"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function usePinVerification() {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [lastCheck, setLastCheck] = useState(0);

  const checkPinStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const config = await res.json();
      setPinEnabled(config.pin_enabled === true);
      setLastCheck(Date.now());
    } catch {}
  }, []);

  useEffect(() => {
    checkPinStatus();
  }, [checkPinStatus]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (Date.now() - lastCheck > 30000) {
        checkPinStatus();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [lastCheck, checkPinStatus]);

  const verifyAndExecute = (action: () => void) => {
    checkPinStatus().then(() => {
      if (!pinEnabled) {
        action();
        return;
      }
      setPendingAction(() => action);
      setShowModal(true);
    });
  };

  const handleVerified = () => {
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      setPendingAction(null);
    }
    setShowModal(open);
  };

  return {
    showModal,
    setShowModal: handleClose,
    verifyAndExecute,
    handleVerified,
    pinEnabled,
    refreshPinStatus: checkPinStatus
  };
}
