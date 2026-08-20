import { Accessibility, ArrowRight, ArrowUpRight, Bluetooth, Check, Keyboard } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CodyboardPermission, PermissionStatus } from "../../shared/hid";
import { AppToolbar } from "../components/layout/AppToolbar";

const EMPTY_STATUS: PermissionStatus = {
  accessibility: false,
  bluetooth: "notDetermined",
  inputMonitoring: false,
};

interface SetupRouteState {
  returnTo?: string;
}

export function SetupPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<PermissionStatus>(EMPTY_STATUS);
  const [isChecking, setIsChecking] = useState(true);
  const [isContinuing, setIsContinuing] = useState(false);
  const [requesting, setRequesting] = useState<CodyboardPermission>();

  const refresh = useCallback(async () => {
    try {
      setStatus(await window.codyboard.permissions.status());
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1_200);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refresh]);

  const requestAccess = async (permission: CodyboardPermission) => {
    setRequesting(permission);
    try {
      await window.codyboard.permissions.openSettings(permission);
      window.setTimeout(() => void refresh(), 500);
    } finally {
      setRequesting(undefined);
    }
  };

  const ready = status.accessibility && status.inputMonitoring;
  const returnTo = (location.state as SetupRouteState | null)?.returnTo ?? "/";
  const continueToApp = async () => {
    if (!ready) return;
    setIsContinuing(true);
    try {
      await window.codyboard.profiles.load();
      void navigate(returnTo, { replace: true });
    } finally {
      setIsContinuing(false);
    }
  };

  return (
    <main className="setup-page">
      <AppToolbar title="Setup" />
      <section className="setup-content">
        <header className="setup-heading">
          <p className="setup-kicker">Device access</p>
          <h1>Connect your<br />controls.</h1>
          <p>Core access powers every Codyboard mapping. Bluetooth is only needed for Xiaomi remote speech. Input never leaves this Mac.</p>
        </header>

        <div className="permission-list" aria-busy={isChecking}>
          <PermissionRow
            allowed={status.accessibility}
            description="Observe keyboard events and send your mapped shortcuts or text."
            icon={<Accessibility />}
            isRequesting={requesting === "accessibility"}
            name="Accessibility"
            onRequest={() => void requestAccess("accessibility")}
          />
          <PermissionRow
            allowed={status.inputMonitoring}
            description="Read device-only controls such as Power and Back."
            icon={<Keyboard />}
            isRequesting={requesting === "inputMonitoring"}
            name="Input Monitoring"
            onRequest={() => void requestAccess("inputMonitoring")}
          />
          <PermissionRow
            allowed={status.bluetooth === "allowed"}
            description="Connect to the Xiaomi voice remote and receive its BLE audio stream."
            icon={<Bluetooth />}
            isRequesting={requesting === "bluetooth"}
            name="Bluetooth"
            onRequest={() => void requestAccess("bluetooth")}
            optional
          />
        </div>

        <footer className="setup-footer">
          <span>{ready ? "Core controls are ready. Bluetooth is optional." : "Grant core access to continue."}</span>
          <button disabled={!ready || isContinuing} onClick={() => void continueToApp()} type="button">
            {isContinuing ? "Starting…" : "Continue"} <ArrowRight />
          </button>
        </footer>
      </section>
    </main>
  );
}

function PermissionRow({
  allowed,
  description,
  icon,
  isRequesting,
  name,
  onRequest,
  optional = false,
}: {
  allowed: boolean;
  description: string;
  icon: ReactNode;
  isRequesting: boolean;
  name: string;
  onRequest: () => void;
  optional?: boolean;
}) {
  return (
    <article className={`permission-row ${allowed ? "is-allowed" : ""}`}>
      <span className="permission-status" aria-label={allowed ? "Granted" : "Not granted"}>
        {allowed && <Check />}
      </span>
      <span className="permission-icon" aria-hidden="true">{icon}</span>
      <span className="permission-copy">
        <strong>{name}{optional && <em>Optional</em>}</strong>
        <small>{description}</small>
      </span>
      <span className="permission-actions">
        {allowed && <span className="permission-granted">Granted</span>}
        <button disabled={isRequesting} onClick={onRequest} type="button">
          {isRequesting ? "Requesting…" : allowed ? "Request Again" : "Request Access"} <ArrowUpRight />
        </button>
      </span>
    </article>
  );
}
