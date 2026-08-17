import { Bluetooth, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router-dom";

import type { HIDDeviceInfo } from "../../shared/hid";
import { SweepPro } from "../components/devices/SweepPro";
import { XiaomiRemote } from "../components/devices/XiaomiRemote";
import { AppToolbar } from "../components/layout/AppToolbar";
import { ViewTransitionLink } from "../components/navigation/ViewTransitionLink";
import { findSupportedDevices, SUPPORTED_DEVICES, type SupportedDevice } from "../lib/device-catalog";

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
  const navigate = useNavigate();
  const displayName = device.hid.product?.trim() || device.name;
  const route = `/devices/${encodeURIComponent(device.hid.id)}?model=${encodeURIComponent(device.model)}`;

  const openDevice = (event: MouseEvent<HTMLAnchorElement>) => {
    if (
      event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    const card = event.currentTarget.closest(".device-card");
    const visual = card?.querySelector<HTMLElement>(".device-preview .mi-remote, .device-preview .sweep-pro");
    if (!visual) return;

    event.preventDefault();
    const bounds = visual.getBoundingClientRect();
    const targetCenterX = window.innerWidth * 0.225;
    const targetCenterY = 60 + (window.innerHeight - 60) / 2;
    const targetRemoteHeight = Math.min(window.innerHeight * 0.76, 710);
    const targetVisualHeight = targetRemoteHeight * (device.model === "sweep-pro" ? 0.9 : 1);
    const ghost = visual.cloneNode(true) as HTMLElement;
    ghost.classList.add("route-device-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.setProperty("--remote-height", `${bounds.height / (device.model === "sweep-pro" ? 0.9 : 1)}px`);
    Object.assign(ghost.style, {
      height: `${bounds.height}px`,
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
    });
    document.body.append(ghost);
    document.documentElement.classList.add("device-route-transitioning");

    flushSync(() => { void navigate(route); });
    const animation = ghost.animate([
      { offset: 0, opacity: 1, transform: "translate3d(0, 0, 0) scale(1)" },
      { offset: 0.35, opacity: 0.88 },
      {
        offset: 1,
        opacity: 0,
        transform: `translate3d(${targetCenterX - (bounds.left + bounds.width / 2)}px, ${targetCenterY - (bounds.top + bounds.height / 2)}px, 0) scale(${targetVisualHeight / bounds.height})`,
      },
    ], {
      duration: 720,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
      fill: "forwards",
    });

    void animation.finished.catch(() => undefined).then(() => {
      ghost.remove();
      document.documentElement.classList.remove("device-route-transitioning");
    });
  };

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
        <span>
          TYPE {device.hid.type ?? "—"} ·{" "}
          {hex(device.vendorId)} · {hex(device.productId)}
        </span>
      </div>
      <ViewTransitionLink
        className="device-card-link"
        to={route}
        aria-label={`Open ${displayName}`}
        onClick={openDevice}
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

function hex(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function availableDevicesLabel(state: DeviceLoadState): string {
  if (state.status === "loading") return "Finding available devices";
  if (state.status === "error") return "Device scan unavailable";
  return `Found ${state.devices.length} available ${state.devices.length === 1 ? "device" : "devices"}`;
}
