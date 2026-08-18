import { Bluetooth, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { findSupportedDevices, SUPPORTED_DEVICES, type SupportedDevice } from "../../shared/device-catalog";
import type { HIDDeviceInfo } from "../../shared/hid";
import { SweepPro } from "../components/devices/SweepPro";
import { XiaomiRemote } from "../components/devices/XiaomiRemote";
import { AppToolbar } from "../components/layout/AppToolbar";
import { ViewTransitionLink } from "../components/navigation/ViewTransitionLink";

type DeviceLoadState =
  | { status: "loading" }
  | { status: "ready"; devices: SupportedDevice[] }
  | { status: "error"; message: string };

export function DeviceSelectionPage() {
  const [state, setState] = useState<DeviceLoadState>({ status: "loading" });
  const scanGeneration = useRef(0);

  const scanDevices = useCallback(async () => {
    const generation = ++scanGeneration.current;
    setState({ status: "loading" });
    if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("preview")) {
      setState({
        status: "ready",
        devices: SUPPORTED_DEVICES.map((device) => ({
          ...device,
          hid: { id: `preview-${device.model}`, isVirtual: false, properties: {} },
        })),
      });
      return;
    }
    try {
      const devices: HIDDeviceInfo[] = await window.codyboard.listHIDs();
      if (scanGeneration.current === generation) setState({ status: "ready", devices: findSupportedDevices(devices) });
    } catch (error) {
      if (scanGeneration.current === generation) {
        setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
      }
    }
  }, []);

  useEffect(() => {
    void scanDevices();
    return () => { scanGeneration.current += 1; };
  }, [scanDevices]);

  return (
    <main className="device-selection-page">
      <div className="selection-atmosphere" aria-hidden="true" />
      <AppToolbar
        actions={(
          <button
            type="button"
            className="toolbar-icon-button"
            disabled={state.status === "loading"}
            onClick={() => void scanDevices()}
            aria-busy={state.status === "loading"}
            aria-label="Refresh devices"
            title="Refresh devices"
          >
            <RefreshCw />
          </button>
        )}
        title="Devices"
      />
      <header className="selection-header">
        <div className="selection-heading">
          <p className="selection-kicker">Hardware</p>
          <h1>Your devices</h1>
        </div>
        <p className="selection-subtitle">Choose a device to configure its active profile.</p>
      </header>

      <section className="device-carousel" aria-label="Connected Codyboard devices">
        <div className="device-carousel-track">
          {state.status === "loading" && <LoadingDevices />}
          {state.status === "error" && <DeviceErrorState message={state.message} onRetry={scanDevices} />}
          {state.status === "ready" && state.devices.length === 0 && (
            <DeviceEmptyState onRetry={scanDevices} />
          )}
          {state.status === "ready" && state.devices.map((device, index) => (
            <DeviceCard device={device} index={index} key={device.hid.id} />
          ))}
        </div>
      </section>

      <footer className="selection-footer">
        <span className="status-light" />
        {availableDevicesLabel(state)}
      </footer>
    </main>
  );
}

function DeviceCard({ device, index }: { device: SupportedDevice; index: number }) {
  const displayName = device.hid.product?.trim() || device.name;
  const route = `/devices/${encodeURIComponent(device.hid.id)}?model=${encodeURIComponent(device.model)}`;

  return (
    <article className="device-card" style={{ "--device-index": index } as CSSProperties}>
      <div className="device-card-glow" aria-hidden="true" />
      <div className="device-preview" aria-hidden="true">
        {device.model === "xiaomi-presenter"
          ? <XiaomiRemote listenToHardware={false} />
          : <SweepPro listenToHardware={false} />}
      </div>
      <div className="device-card-caption">
        <p>{displayName}</p>
        <span>PHYSICAL ID · {device.hid.id}</span>
      </div>
      <ViewTransitionLink
        className="device-card-link"
        direction="forward"
        to={route}
        aria-label={`Open ${displayName}`}
      />
    </article>
  );
}

function LoadingDevices() {
  return (
    <div className="device-loading" role="status">
      <span /><span /><span />
      <p>Scanning HID devices</p>
    </div>
  );
}

function DeviceEmptyState({ onRetry }: { onRetry: () => Promise<void> }) {
  return (
    <div className="device-empty-state">
      <div className="empty-device-radar" aria-hidden="true">
        <span /><span /><Bluetooth />
      </div>
      <h2>No devices found</h2>
      <p>Turn on your device and make sure it is connected to this Mac.</p>
      <span className="empty-device-support">Xiaomi Presenter · Sweep Pro</span>
      <button type="button" onClick={() => void onRetry()}>
        <RefreshCw />
        Scan again
      </button>
    </div>
  );
}

function DeviceErrorState({ message, onRetry }: { message: string; onRetry: () => Promise<void> }) {
  return (
    <div className="device-empty-state is-error">
      <div className="empty-device-radar" aria-hidden="true"><RefreshCw /></div>
      <h2>Unable to scan devices</h2>
      <p>{message}</p>
      <button type="button" onClick={() => void onRetry()}><RefreshCw />Try again</button>
    </div>
  );
}

function availableDevicesLabel(state: DeviceLoadState): string {
  if (state.status === "loading") return "Finding available devices";
  if (state.status === "error") return "Device scan unavailable";
  return `Found ${state.devices.length} available ${state.devices.length === 1 ? "device" : "devices"}`;
}
