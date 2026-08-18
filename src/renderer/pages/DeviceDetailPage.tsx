import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { getDeviceDefinition } from "../../shared/device-catalog";
import type { HIDDeviceInfo } from "../../shared/hid";
import { Device } from "../components/devices/Device";
import { DeviceButtonMappings } from "../components/devices/DeviceButtonMappings";
import { SweepPro } from "../components/devices/SweepPro";
import { XiaomiRemote, type XiaomiRemoteKey, type XiaomiRemoteKeyPressEvent } from "../components/devices/XiaomiRemote";
import { AppToolbar } from "../components/layout/AppToolbar";
import { ProfileSwitcher } from "../components/profiles/ProfileSwitcher";

export function DeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const [searchParameters] = useSearchParams();
  const definition = getDeviceDefinition(searchParameters.get("model"));
  const [hid, setHid] = useState<HIDDeviceInfo>();
  const [selectedKey, setSelectedKey] = useState<XiaomiRemoteKey>();

  useEffect(() => {
    let mounted = true;
    void window.codyboard.listHIDs().then((devices) => {
      if (mounted) setHid(devices.find((device) => device.id === deviceId));
    }).catch(() => {
      // The catalog fallback keeps the detail page useful if a device disconnects.
    });
    return () => { mounted = false; };
  }, [deviceId]);

  const deviceName = hid?.product?.trim() || definition?.name || "Device";
  const keyboardType = hid?.type ?? definition?.keyboardType;

  useEffect(() => {
    if (keyboardType === undefined) return;

    const enterSettingMode = () => {
      void window.codyboard.diagnostics.setKeyboardType(keyboardType).catch((error: unknown) => {
        console.error("Unable to enter device setting mode", error);
      });
    };
    const leaveSettingMode = () => {
      void window.codyboard.diagnostics.setKeyboardType().catch((error: unknown) => {
        console.error("Unable to leave device setting mode", error);
      });
    };

    window.addEventListener("focus", enterSettingMode);
    window.addEventListener("blur", leaveSettingMode);
    if (document.hasFocus()) enterSettingMode();

    return () => {
      window.removeEventListener("focus", enterSettingMode);
      window.removeEventListener("blur", leaveSettingMode);
      leaveSettingMode();
    };
  }, [keyboardType]);

  const onKeyPress = useCallback((event: XiaomiRemoteKeyPressEvent) => {
    if (event.phase === "down") setSelectedKey(event.key);
    window.dispatchEvent(new CustomEvent("codyboard:remote-keypress", { detail: event }));
  }, []);
  const deselectOnOutsidePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest(".mi-remote button, .mapping-row")) return;
    setSelectedKey(undefined);
  }, []);
  const remote = useMemo(() => definition?.model === "sweep-pro"
    ? <SweepPro listenToHardware={false} onKeyPress={onKeyPress} />
    : <XiaomiRemote onKeyPress={onKeyPress} selectedKey={selectedKey} />, [definition?.model, onKeyPress, selectedKey]);

  return (
    <main className="device-detail-page" onPointerDown={deselectOnOutsidePointerDown}>
      <AppToolbar
        actions={<ProfileSwitcher keyboardType={keyboardType} />}
        backTo="/"
        className="detail-toolbar"
        title={deviceName}
      />
      <div className="device-detail-layout">
        <Device keyboardType={keyboardType} className="remote-stage detail-device-stage">
          {remote}
        </Device>
        <aside className="device-detail-panel" aria-label={`${deviceName} settings`}>
          {definition?.model === "xiaomi-presenter"
            ? <DeviceButtonMappings keyboardType={keyboardType} onSelectKey={setSelectedKey} selectedKey={selectedKey} />
            : <p className="mapping-notice is-neutral">Sweep Pro control discovery is not available yet.</p>}
        </aside>
      </div>
    </main>
  );
}
