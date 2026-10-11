import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { profileDomainKey, type ProfileDomain, type ProfileDraft, type ProfilesSnapshot } from "../../../shared/hid";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../ui/select";

import { ProfileDialog } from "./ProfileDialog";

export interface ProfileSwitcherProps { profileDomain?: ProfileDomain; }

const ADD_PROFILE = "__add_profile__";
const INACTIVE_PROFILE = "__inactive__";

export function ProfileSwitcher({ profileDomain }: ProfileSwitcherProps) {
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [isChanging, setIsChanging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"create" | "delete">();
  const [pendingDeletionId, setPendingDeletionId] = useState<string>();
  const [newProfileName, setNewProfileName] = useState("");
  const [error, setError] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);
  const closeDialog = () => { setDialog(undefined); setPendingDeletionId(undefined); };

  useEffect(() => {
    let mounted = true;
    const acceptSnapshot = (next: ProfilesSnapshot) => {
      if (mounted) setSnapshot((current) =>
        current && current.generation > next.generation ? current : next,
      );
    };
    void window.codyboard.profiles.snapshot().then(acceptSnapshot);
    const unsubscribe = window.codyboard.profiles.onEvent((event) => {
      if (event.type === "changed") acceptSnapshot(event.snapshot);
    });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (dialog === undefined) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isChanging) closeDialog();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog, isChanging]);

  const collection = profileDomain === undefined
    ? undefined
    : snapshot?.keyboards[profileDomainKey(profileDomain)];
  const profiles = collection?.profiles ?? [];
  const activeProfileId = collection?.activeProfile?.id ?? "";
  const activeProfile = profiles.find(({ id }) => id === activeProfileId);
  const pendingDeletion = profiles.find(({ id }) => id === pendingDeletionId);
  const unavailable = profileDomain === undefined || profiles.length === 0;

  const changeProfile = async (profileId: string) => {
    if (profileDomain === undefined) return;
    if (profileId === ADD_PROFILE) {
      setError(undefined); setNewProfileName(""); setPendingDeletionId(undefined); setDialog("create");
      window.setTimeout(() => nameInput.current?.focus(), 0);
      return;
    }
    setIsChanging(true);
    try {
      setSnapshot(profileId === INACTIVE_PROFILE
        ? await window.codyboard.profiles.deactivate(profileDomain)
        : await window.codyboard.profiles.activate(profileDomain, profileId));
    } finally { setIsChanging(false); }
  };

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (profileDomain === undefined) return;
    const name = newProfileName.trim();
    const source = activeProfile ?? profiles.find(({ id }) => id === "default") ?? profiles[0];
    if (!name || !source) return;
    setIsChanging(true); setError(undefined);
    try {
      const id = nextProfileId(name, profiles);
      await window.codyboard.profiles.create(profileDomain, {
        groups: structuredClone(source.groups), id, name,
      });
      setSnapshot(await window.codyboard.profiles.activate(profileDomain, id));
      setDialog(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create profile");
    } finally { setIsChanging(false); }
  };

  const deleteProfile = async () => {
    if (profileDomain === undefined || !pendingDeletion || pendingDeletion.id === "default") return;
    setIsChanging(true); setError(undefined);
    try {
      let next = await window.codyboard.profiles.remove(profileDomain, pendingDeletion.id);
      if (activeProfileId === pendingDeletion.id) {
        const defaultProfile = profiles.find(({ id }) => id === "default");
        if (defaultProfile) next = await window.codyboard.profiles.activate(profileDomain, defaultProfile.id);
      }
      setSnapshot(next); closeDialog();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete profile");
    } finally { setIsChanging(false); }
  };

  return <div className="profile-switcher">
    <Select disabled={unavailable || isChanging} onOpenChange={setMenuOpen}
      onValueChange={(value) => void changeProfile(value)} open={menuOpen}
      value={unavailable ? "__unavailable__" : activeProfileId || INACTIVE_PROFILE}>
      <SelectTrigger aria-label="Active device profile" className="profile-select-trigger"><SelectValue /></SelectTrigger>
      <SelectContent align="end" className="profile-select-menu">
        {unavailable && <SelectItem disabled value="__unavailable__">
          {profileDomain === undefined ? "Device unavailable" : "No profiles"}
        </SelectItem>}
        {profiles.map((profile) => profile.id === "default"
          ? <SelectItem key={profile.id} value={profile.id}>Default</SelectItem>
          : <div className="profile-menu-option" key={profile.id}>
              <SelectItem value={profile.id}>{profile.name}</SelectItem>
              <button aria-label={`Delete ${profile.name} profile`} className="select-row-remove"
                disabled={isChanging} onClick={(event) => {
                  event.stopPropagation(); setError(undefined); setMenuOpen(false);
                  setPendingDeletionId(profile.id); setDialog("delete");
                }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} type="button">
                <Trash2 aria-hidden="true" />
              </button>
            </div>)}
        {!unavailable && <>
          <SelectItem value={INACTIVE_PROFILE}>Inactive</SelectItem><SelectSeparator />
          <SelectItem className="profile-menu-action" value={ADD_PROFILE}>
            <span className="profile-menu-action-content"><Plus aria-hidden="true" /><span>Add New Profile</span></span>
          </SelectItem>
        </>}
      </SelectContent>
    </Select>
    {dialog && <ProfileDialog activeProfile={activeProfile} close={closeDialog}
      createProfile={createProfile} deleteProfile={deleteProfile} dialog={dialog} error={error}
      isChanging={isChanging} nameInput={nameInput} newProfileName={newProfileName}
      pendingDeletion={pendingDeletion} setNewProfileName={setNewProfileName} />}
  </div>;
}

function nextProfileId(name: string, profiles: readonly ProfileDraft[]): string {
  const base = name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "profile";
  const ids = new Set(profiles.map(({ id }) => id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
