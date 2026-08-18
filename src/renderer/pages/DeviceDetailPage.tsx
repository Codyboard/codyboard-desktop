import { useCallback, useEffect, useMemo, useState, type PointerEvent } from "react";
import { useSearchParams } from "react-router-dom";

import { getDeviceDefinition } from "../../shared/device-catalog";
import { profileDomainKey, type HIDDeviceInfo } from "../../shared/hid";
import { Device } from "../components/devices/Device";
import {
  DeviceButtonMappings,
  SWEEP_PRO_CONTROLS,
  SWEEP_PRO_DEFAULT_PROFILE,
  XIAOMI_REMOTE_CONTROLS,
  XIAOMI_REMOTE_DEFAULT_PROFILE,
} from "../components/devices/DeviceButtonMappings";
import { SweepPro, type SweepProKey, type SweepProKeyPressEvent } from "../components/devices/SweepPro";
import { XiaomiRemote, type XiaomiRemoteKey, type XiaomiRemoteKeyPressEvent } from "../components/devices/XiaomiRemote";
import { AppToolbar } from "../components/layout/AppToolbar";
import { ProfileSwitcher } from "../components/profiles/ProfileSwitcher";

export function DeviceDetailPage({ deviceId }: { deviceId: string }) {
  const [searchParameters] = useSearchParams();
  const definition = getDeviceDefinition(searchParameters.get("model"));
  const [hid, setHid] = useState<HIDDeviceInfo>();
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
  const profileDomain = hid?.id ?? deviceId;
  const keyboardType = hid?.type ?? definition?.keyboardType;

  useEffect(() => {
    void window.codyboard.profiles.snapshot().then(async (snapshot) => {
      if (snapshot.keyboards[profileDomainKey(profileDomain)]?.profiles.length) return;
      await window.codyboard.profiles.create(
        profileDomain,
        isSweepPro ? SWEEP_PRO_DEFAULT_PROFILE : XIAOMI_REMOTE_DEFAULT_PROFILE,
      );
    }).catch((error: unknown) => console.error("Unable to create Sweep Pro profile", error));
  }, [isSweepPro, profileDomain]);

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
        actions={<ProfileSwitcher profileDomain={profileDomain} />}
        backTo="/"
        className="detail-toolbar"
        title={deviceName}
        titleTooltip={<><span>Physical HID</span><code>{hid?.id ?? deviceId}</code></>}
      />
      <div className="device-detail-layout">
        <Device keyboardType={keyboardType} className="remote-stage detail-device-stage">
          {remote}
        </Device>
        <aside className="device-detail-panel" aria-label={`${deviceName} settings`}>
          {definition?.model === "sweep-pro"
            ? (
                <DeviceButtonMappings
                  controls={SWEEP_PRO_CONTROLS}
                  profileDomain={profileDomain}
                  onSelectKey={setSelectedSweepProKey}
                  selectedKey={selectedSweepProKey}
                />
              )
            : (
                <DeviceButtonMappings
                  controls={XIAOMI_REMOTE_CONTROLS}
                  profileDomain={profileDomain}
                  onSelectKey={setSelectedXiaomiKey}
                  selectedKey={selectedXiaomiKey}
                />
              )}
        </aside>
      </div>
    </main>
  );
}
