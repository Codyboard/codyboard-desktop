import { Accessibility, ArrowRight, ArrowUpRight, Check, Keyboard } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CodyboardPermission, PermissionStatus } from "../../shared/hid";
import { AppToolbar } from "../components/layout/AppToolbar";

const EMPTY_STATUS: PermissionStatus = { accessibility: false, inputMonitoring: false };

interface PermissionRouteState {
  returnTo?: string;
}

export function PermissionsPage() {
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
  const returnTo = (location.state as PermissionRouteState | null)?.returnTo ?? "/";
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
    <main className="permissions-page">
      <AppToolbar title="Permissions" />
      <section className="permissions-content">
        <header className="permissions-heading">
          <p className="permissions-kicker">System access</p>
          <h1>Two permissions.<br />Nothing more.</h1>
          <p>Codyboard needs access to hear your controller and send the shortcuts you assign. Input never leaves this Mac.</p>
        </header>

        <div className="permission-list" aria-busy={isChecking}>
          <PermissionRow
            allowed={status.accessibility}
            description="Observe keyboard events and send your mapped shortcuts."
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
        </div>

        <footer className="permissions-footer">
          <span>{ready ? "Codyboard is ready." : "After granting access, return here to continue."}</span>
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
}: {
  allowed: boolean;
  description: string;
  icon: ReactNode;
  isRequesting: boolean;
  name: string;
  onRequest: () => void;
}) {
  return (
    <article className={`permission-row ${allowed ? "is-allowed" : ""}`}>
      <span className="permission-status" aria-label={allowed ? "Granted" : "Not granted"}>
        {allowed && <Check />}
      </span>
      <span className="permission-icon" aria-hidden="true">{icon}</span>
      <span className="permission-copy">
        <strong>{name}</strong>
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
