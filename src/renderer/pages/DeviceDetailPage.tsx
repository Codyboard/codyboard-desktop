import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { useParams, useSearchParams } from "react-router-dom";

import { getDeviceDefinition } from "../../shared/device-catalog";
import type { HIDDeviceInfo } from "../../shared/hid";
import { Device } from "../components/devices/Device";
import {
  DeviceButtonMappings,
  SWEEP_PRO_CONTROLS,
  SWEEP_PRO_DEFAULT_PROFILE,
  XIAOMI_REMOTE_CONTROLS,
} from "../components/devices/DeviceButtonMappings";
import { SweepPro, type SweepProKey, type SweepProKeyPressEvent } from "../components/devices/SweepPro";
import { XiaomiRemote, type XiaomiRemoteKey, type XiaomiRemoteKeyPressEvent } from "../components/devices/XiaomiRemote";
import { AppToolbar } from "../components/layout/AppToolbar";
import { ProfileSwitcher } from "../components/profiles/ProfileSwitcher";

export function DeviceDetailPage() {
  const { deviceId = "" } = useParams();
  const [searchParameters] = useSearchParams();
  const definition = getDeviceDefinition(searchParameters.get("model"));
  const [hid, setHid] = useState<HIDDeviceInfo>();
  const [detectedKeyCode, setDetectedKeyCode] = useState<number>();
  const [detectedKeyboardType, setDetectedKeyboardType] = useState<number>();
  const [selectedSweepProKey, setSelectedSweepProKey] = useState<SweepProKey>();
  const [selectedXiaomiKey, setSelectedXiaomiKey] = useState<XiaomiRemoteKey>();

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
  const isSweepPro = definition?.model === "sweep-pro";
  const keyboardType = hid?.type ?? detectedKeyboardType ?? definition?.keyboardType;
  const diagnosticKeyboardType = isSweepPro && keyboardType === undefined ? -1 : keyboardType;

  useEffect(() => {
    if (diagnosticKeyboardType === undefined) return;

    const enterSettingMode = () => {
      void window.codyboard.diagnostics.setKeyboardType(diagnosticKeyboardType).catch((error: unknown) => {
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
  }, [diagnosticKeyboardType]);

  useEffect(() => {
    if (!isSweepPro || keyboardType === undefined) return;
    void window.codyboard.profiles.snapshot().then(async (snapshot) => {
      if (snapshot.keyboards[String(keyboardType)]?.profiles.length) return;
      await window.codyboard.profiles.create(keyboardType, SWEEP_PRO_DEFAULT_PROFILE);
    }).catch((error: unknown) => console.error("Unable to create Sweep Pro profile", error));
  }, [isSweepPro, keyboardType]);

  useEffect(() => {
    if (!isSweepPro) return;
    return window.codyboard.diagnostics.onKey((event) => {
      if (event.source !== "keyCode") return;
      if (![0, 1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 17].includes(event.code)) return;
      setDetectedKeyCode(event.code);
      setDetectedKeyboardType(event.keyboardType);
    });
  }, [isSweepPro]);

  const onKeyPress = useCallback((event: XiaomiRemoteKeyPressEvent) => {
    if (event.phase === "down") setSelectedXiaomiKey(event.key);
    window.dispatchEvent(new CustomEvent("codyboard:remote-keypress", { detail: event }));
  }, []);
  const onSweepProKeyPress = useCallback((event: SweepProKeyPressEvent) => {
    if (event.phase === "down") setSelectedSweepProKey(event.key);
    window.dispatchEvent(new CustomEvent("codyboard:remote-keypress", { detail: event }));
  }, []);
  const deselectOnOutsidePointerDown = useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.target instanceof Element && event.target.closest(".mi-remote button, .sweep-pro button, .mapping-row")) return;
    setSelectedSweepProKey(undefined);
    setSelectedXiaomiKey(undefined);
  }, []);
  const remote = useMemo(() => definition?.model === "sweep-pro"
    ? <SweepPro onKeyPress={onSweepProKeyPress} selectedKey={selectedSweepProKey} />
    : <XiaomiRemote onKeyPress={onKeyPress} selectedKey={selectedXiaomiKey} />,
  [definition?.model, onKeyPress, onSweepProKeyPress, selectedSweepProKey, selectedXiaomiKey]);

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
          {isSweepPro && (
            <p className="mapping-device-identity">
              <span>Detected input</span>
              <code>type {detectedKeyboardType ?? "waiting"} · keyCode {detectedKeyCode ?? "—"}</code>
            </p>
          )}
          {definition?.model === "sweep-pro"
            ? (
                <DeviceButtonMappings
                  controls={SWEEP_PRO_CONTROLS}
                  keyboardType={keyboardType}
                  onSelectKey={setSelectedSweepProKey}
                  selectedKey={selectedSweepProKey}
                />
              )
            : (
                <DeviceButtonMappings
                  controls={XIAOMI_REMOTE_CONTROLS}
                  keyboardType={keyboardType}
                  onSelectKey={setSelectedXiaomiKey}
                  selectedKey={selectedXiaomiKey}
                />
              )}
        </aside>
      </div>
    </main>
  );
}
