import { useEffect, useState, type ReactNode } from "react";
import { HashRouter, matchPath, Navigate, Route, Routes, useLocation } from "react-router-dom";

import type { PermissionStatus } from "../shared/hid";

import { MidiPage } from "./features/midi/MidiPage";
import { DeviceDetailPage } from "./pages/DeviceDetailPage";
import { DeviceSelectionPage } from "./pages/DeviceSelectionPage";
import { SetupPage } from "./pages/SetupPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/midi" element={<MidiPage />} />
        <Route path="/*" element={<SetupGuard><DeviceRouteStack /></SetupGuard>} />
      </Routes>
    </HashRouter>
  );
}

function DeviceRouteStack() {
  const location = useLocation();
  const isSelection = location.pathname === "/";
  const detailMatch = matchPath("/devices/:deviceId", location.pathname);
  const isDetail = Boolean(detailMatch);

  if (!isSelection && !isDetail) return <Navigate replace to="/" />;

  return (
    <div className={`device-route-stack ${isDetail ? "has-detail" : ""}`.trim()}>
      <div aria-hidden={isDetail} className="route-layer-selection" inert={isDetail}>
        <DeviceSelectionPage />
      </div>
      {detailMatch?.params.deviceId && (
        <div className="route-layer-detail">
          <DeviceDetailPage deviceId={detailMatch.params.deviceId} />
        </div>
      )}
    </div>
  );
}

function SetupGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<PermissionStatus>();

  useEffect(() => {
    let mounted = true;
    void window.codyboard.permissions.status().then((nextStatus) => {
      if (mounted) setStatus(nextStatus);
    }).catch(() => {
      if (mounted) setStatus({
        accessibility: false,
        bluetooth: "notDetermined",
        inputMonitoring: false,
      });
    });
    return () => { mounted = false; };
  }, []);

  if (!status) return <div className="setup-route-loading" aria-label="Checking setup" />;
  if (!status.accessibility || !status.inputMonitoring) {
    return <Navigate replace state={{ returnTo: `${location.pathname}${location.search}` }} to="/setup" />;
  }
  return children;
}
