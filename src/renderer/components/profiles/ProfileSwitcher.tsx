import { useEffect, useState } from "react";

import type { ProfilesSnapshot } from "../../../shared/hid";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";

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

  const changeProfile = async (profileId: string) => {
    if (keyboardType === undefined) return;
    setIsChanging(true);
    try {
      const nextSnapshot = profileId !== "__inactive__"
        ? await window.codyboard.profiles.activate(keyboardType, profileId)
        : await window.codyboard.profiles.deactivate(keyboardType);
      setSnapshot(nextSnapshot);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <div className="profile-switcher">
      <Select
        disabled={unavailable || isChanging}
        onValueChange={(value) => void changeProfile(value)}
        value={unavailable ? "__unavailable__" : activeProfileId || "__inactive__"}
      >
        <SelectTrigger
          aria-label="Active device profile"
          className="profile-select-trigger"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" className="profile-select-menu">
          {unavailable && (
            <SelectItem disabled value="__unavailable__">
              {keyboardType === undefined ? "Type unavailable" : "No profiles"}
            </SelectItem>
          )}
          {!unavailable && <SelectItem value="__inactive__">Inactive</SelectItem>}
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>{profile.id === "default" ? "Default" : profile.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
