export type HIDModifier = "command" | "control" | "option" | "shift" | "fn";
export type CodyboardTheme = "dark" | "light";
export type CodyboardPermission = "accessibility" | "inputMonitoring";

export interface HIDDeviceInfo {
  id: string;
  type?: number;
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
  manufacturer?: string;
  product?: string;
  serialNumber?: string;
  transport?: string;
  locationId?: number;
  isVirtual: boolean;
  properties: Record<string, string>;
}

export interface HIDListOptions { includeVirtual?: boolean; }

export interface CodyboardApplicationInfo {
  bundleId: string;
  iconDataUrl: string;
  name: string;
  path: string;
}

export interface PermissionStatus {
  accessibility: boolean;
  inputMonitoring: boolean;
}

export interface HIDKeyEvent {
  device: HIDDeviceInfo;
  eventType: "keydown" | "keyup" | "flagschanged" | "systemdefined";
  key: string;
  code: number;
  usagePage: number;
  pressed: boolean;
  value: number;
  timestamp: number;
  flags: number;
}

export interface HIDDiagnosticEvent {
  deviceId?: string;
  keyboardType?: number;
  eventType: "keydown" | "keyup" | "flagschanged";
  source: "keyCode" | "hidUsage";
  code: number;
  keyCode?: number;
  flags: number;
  timestamp: number;
}
