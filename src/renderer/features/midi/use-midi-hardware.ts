import { useEffect, useState } from "react";

import { findSupportedDevices } from "../../../shared/device-catalog";

export function useMidiHardware(): {
  captureError: boolean;
  hardwareDeviceId?: string;
} {
  const [captureError, setCaptureError] = useState(false);
  const [hardwareDeviceId, setHardwareDeviceId] = useState<string>();
  useEffect(() => {
    const ownerId = crypto.randomUUID();
    let capturedDeviceId: string | undefined;
    let disposed = false;
    let scanning = false;
    const scan = async () => {
      if (scanning || disposed) return;
      scanning = true;
      try {
        const devices = findSupportedDevices(await window.codyboard.listHIDs());
        const sweep = devices.find((device) => device.model === "sweep-pro");
        const nextDeviceId = sweep?.profileDomain;
        if (nextDeviceId === capturedDeviceId) return;
        if (capturedDeviceId)
          await window.codyboard.midi.setExclusiveDevice(undefined, ownerId);
        capturedDeviceId = undefined;
        setHardwareDeviceId(undefined);
        if (nextDeviceId) {
          try {
            await window.codyboard.midi.setExclusiveDevice(nextDeviceId, ownerId);
            if (disposed) {
              await window.codyboard.midi.setExclusiveDevice(undefined, ownerId);
              return;
            }
            capturedDeviceId = nextDeviceId;
            setHardwareDeviceId(nextDeviceId);
            setCaptureError(false);
          } catch { setCaptureError(true); }
        } else setCaptureError(false);
      } catch {
        // The on-screen instrument remains usable if device enumeration fails.
      } finally { scanning = false; }
    };
    void scan();
    const interval = window.setInterval(() => void scan(), 2_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      void window.codyboard.midi.setExclusiveDevice(undefined, ownerId);
    };
  }, []);
  return { captureError, hardwareDeviceId };
}
