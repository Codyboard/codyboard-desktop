import { useEffect, useState, type ReactNode } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";

import type { PermissionStatus } from "../shared/hid";

import { DeviceDetailPage } from "./pages/DeviceDetailPage";
import { DeviceSelectionPage } from "./pages/DeviceSelectionPage";
import { PermissionsPage } from "./pages/PermissionsPage";

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/permissions" element={<PermissionsPage />} />
        <Route path="/" element={<PermissionGuard><DeviceSelectionPage /></PermissionGuard>} />
        <Route path="/devices/:deviceId" element={<PermissionGuard><DeviceDetailPage /></PermissionGuard>} />
        <Route path="*" element={<Navigate replace to="/" />} />
      </Routes>
    </HashRouter>
  );
}

function PermissionGuard({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = useState<PermissionStatus>();

  useEffect(() => {
    let mounted = true;
    void window.codyboard.permissions.status().then((nextStatus) => {
      if (mounted) setStatus(nextStatus);
    }).catch(() => {
      if (mounted) setStatus({ accessibility: false, inputMonitoring: false });
    });
    return () => { mounted = false; };
  }, []);

  if (!status) return <div className="permission-route-loading" aria-label="Checking permissions" />;
  if (!status.accessibility || !status.inputMonitoring) {
    return <Navigate replace state={{ returnTo: `${location.pathname}${location.search}` }} to="/permissions" />;
  }
  return children;
}
