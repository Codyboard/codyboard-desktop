import { ChevronDown } from "lucide-react";
import { useEffect, useState, type ChangeEvent } from "react";

import type { ProfilesSnapshot } from "../../../shared/hid";

export interface ProfileSwitcherProps {
  keyboardType?: number;
}

export function ProfileSwitcher({ keyboardType }: ProfileSwitcherProps) {
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    let mounted = true;
    void window.codyboard.profiles.snapshot().then((nextSnapshot) => {
      if (mounted) setSnapshot(nextSnapshot);
    });
    const unsubscribe = window.codyboard.profiles.onEvent((event) => {
      if (event.type === "changed") setSnapshot(event.snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const profiles = keyboardType === undefined ? [] : snapshot?.keyboards[String(keyboardType)]?.profiles ?? [];
  const activeProfileId = keyboardType === undefined
    ? ""
    : snapshot?.keyboards[String(keyboardType)]?.activeProfile?.id ?? "";
  const unavailable = keyboardType === undefined || profiles.length === 0;

  const changeProfile = async (event: ChangeEvent<HTMLSelectElement>) => {
    if (keyboardType === undefined) return;
    setIsChanging(true);
    try {
      const nextSnapshot = event.target.value
        ? await window.codyboard.profiles.activate(keyboardType, event.target.value)
        : await window.codyboard.profiles.deactivate(keyboardType);
      setSnapshot(nextSnapshot);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <label className="profile-switcher">
      <span className="profile-select-shell">
        <select
          aria-label="Active device profile"
          disabled={unavailable || isChanging}
          onChange={(event) => void changeProfile(event)}
          value={activeProfileId}
        >
          {unavailable && <option value="">{keyboardType === undefined ? "Type unavailable" : "No profiles"}</option>}
          {!unavailable && <option value="">Inactive</option>}
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>{profile.id === "default" ? "Default" : profile.name}</option>
          ))}
        </select>
        <ChevronDown aria-hidden="true" />
      </span>
    </label>
  );
}
