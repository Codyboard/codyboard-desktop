import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { profileDomainKey, type ProfileDomain, type ProfileDraft, type ProfilesSnapshot } from "../../../shared/hid";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "../ui/select";

export interface ProfileSwitcherProps {
  profileDomain?: ProfileDomain;
}

const ADD_PROFILE = "__add_profile__";
const INACTIVE_PROFILE = "__inactive__";

function nextProfileId(name: string, profiles: readonly ProfileDraft[]): string {
  const slug = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug || "profile";
  const ids = new Set(profiles.map(({ id }) => id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export function ProfileSwitcher({ profileDomain }: ProfileSwitcherProps) {
  const [snapshot, setSnapshot] = useState<ProfilesSnapshot>();
  const [isChanging, setIsChanging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<"create" | "delete">();
  const [profilePendingDeletionId, setProfilePendingDeletionId] = useState<string>();
  const [newProfileName, setNewProfileName] = useState("");
  const [error, setError] = useState<string>();
  const nameInput = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (dialog === undefined) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isChanging) {
        setDialog(undefined);
        setProfilePendingDeletionId(undefined);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [dialog, isChanging]);

  const profiles = profileDomain === undefined ? [] : snapshot?.keyboards[profileDomainKey(profileDomain)]?.profiles ?? [];
  const activeProfileId = profileDomain === undefined
    ? ""
    : snapshot?.keyboards[profileDomainKey(profileDomain)]?.activeProfile?.id ?? "";
  const activeProfile = profiles.find(({ id }) => id === activeProfileId);
  const profilePendingDeletion = profiles.find(({ id }) => id === profilePendingDeletionId);
  const unavailable = profileDomain === undefined || profiles.length === 0;

  const changeProfile = async (profileId: string) => {
    if (profileDomain === undefined) return;
    if (profileId === ADD_PROFILE) {
      setError(undefined);
      setNewProfileName("");
      setProfilePendingDeletionId(undefined);
      setDialog("create");
      window.setTimeout(() => nameInput.current?.focus(), 0);
      return;
    }
    setIsChanging(true);
    try {
      const nextSnapshot = profileId !== INACTIVE_PROFILE
        ? await window.codyboard.profiles.activate(profileDomain, profileId)
        : await window.codyboard.profiles.deactivate(profileDomain);
      setSnapshot(nextSnapshot);
    } finally {
      setIsChanging(false);
    }
  };

  const requestProfileDeletion = (profileId: string) => {
    setError(undefined);
    setMenuOpen(false);
    setProfilePendingDeletionId(profileId);
    setDialog("delete");
  };

  const createProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (profileDomain === undefined) return;
    const name = newProfileName.trim();
    const source = activeProfile ?? profiles.find(({ id }) => id === "default") ?? profiles[0];
    if (!name || !source) return;
    setIsChanging(true);
    setError(undefined);
    try {
      const id = nextProfileId(name, profiles);
      let nextSnapshot = await window.codyboard.profiles.create(profileDomain, {
        groups: structuredClone(source.groups),
        id,
        name,
      });
      nextSnapshot = await window.codyboard.profiles.activate(profileDomain, id);
      setSnapshot(nextSnapshot);
      setDialog(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to create profile");
    } finally {
      setIsChanging(false);
    }
  };

  const deleteProfile = async () => {
    if (profileDomain === undefined || !profilePendingDeletion || profilePendingDeletion.id === "default") return;
    setIsChanging(true);
    setError(undefined);
    try {
      let nextSnapshot = await window.codyboard.profiles.remove(profileDomain, profilePendingDeletion.id);
      if (activeProfileId === profilePendingDeletion.id) {
        const defaultProfile = profiles.find(({ id }) => id === "default");
        if (defaultProfile) nextSnapshot = await window.codyboard.profiles.activate(profileDomain, defaultProfile.id);
      }
      setSnapshot(nextSnapshot);
      setProfilePendingDeletionId(undefined);
      setDialog(undefined);
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to delete profile");
    } finally {
      setIsChanging(false);
    }
  };

  const closeDialog = () => {
    setDialog(undefined);
    setProfilePendingDeletionId(undefined);
  };

  return (
    <div className="profile-switcher">
      <Select
        disabled={unavailable || isChanging}
        onOpenChange={setMenuOpen}
        onValueChange={(value) => void changeProfile(value)}
        open={menuOpen}
        value={unavailable ? "__unavailable__" : activeProfileId || INACTIVE_PROFILE}
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
              {profileDomain === undefined ? "Device unavailable" : "No profiles"}
            </SelectItem>
          )}
          {profiles.map((profile) => profile.id === "default"
            ? <SelectItem key={profile.id} value={profile.id}>Default</SelectItem>
            : (
                <div className="profile-menu-option" key={profile.id}>
                  <SelectItem value={profile.id}>{profile.name}</SelectItem>
                  <button
                    aria-label={`Delete ${profile.name} profile`}
                    className="select-row-remove"
                    disabled={isChanging}
                    onClick={(event) => {
                      event.stopPropagation();
                      requestProfileDeletion(profile.id);
                    }}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>
              ))}
          {!unavailable && (
            <>
              <SelectItem value={INACTIVE_PROFILE}>Inactive</SelectItem>
              <SelectSeparator />
              <SelectItem className="profile-menu-action" value={ADD_PROFILE}>
                <span className="profile-menu-action-content">
                  <Plus aria-hidden="true" />
                  <span>Add New Profile</span>
                </span>
              </SelectItem>
            </>
          )}
        </SelectContent>
      </Select>
      {dialog !== undefined && createPortal(
        <div
          className="profile-dialog-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target && !isChanging) closeDialog();
          }}
        >
          <section aria-labelledby="profile-dialog-title" aria-modal="true" className="profile-dialog" role="dialog">
            <button
              aria-label="Close"
              className="profile-dialog-close"
              disabled={isChanging}
              onClick={closeDialog}
              type="button"
            >
              <X aria-hidden="true" />
            </button>
            {dialog === "create" ? (
              <form onSubmit={(event) => void createProfile(event)}>
                <span className="profile-dialog-eyebrow">Profiles</span>
                <h2 id="profile-dialog-title">Add New Profile</h2>
                <p>Start with a copy of {activeProfile?.name ?? "Default"}, then customize its mappings.</p>
                <label htmlFor="new-profile-name">Profile name</label>
                <input
                  autoComplete="off"
                  id="new-profile-name"
                  maxLength={48}
                  onChange={(event) => setNewProfileName(event.target.value)}
                  placeholder="e.g. Presentations"
                  ref={nameInput}
                  value={newProfileName}
                />
                {error && <p className="profile-dialog-error" role="alert">{error}</p>}
                <div className="profile-dialog-actions">
                  <button disabled={isChanging} onClick={closeDialog} type="button">Cancel</button>
                  <button className="is-primary" disabled={isChanging || !newProfileName.trim()} type="submit">
                    {isChanging ? "Creating…" : "Create Profile"}
                  </button>
                </div>
              </form>
            ) : (
              <div>
                <span className="profile-dialog-eyebrow">Profiles</span>
                <h2 id="profile-dialog-title">Delete {profilePendingDeletion?.name}?</h2>
                <p>This permanently removes the profile and its custom mappings. Default will remain available.</p>
                {error && <p className="profile-dialog-error" role="alert">{error}</p>}
                <div className="profile-dialog-actions">
                  <button disabled={isChanging} onClick={closeDialog} type="button">Cancel</button>
                  <button className="is-destructive" disabled={isChanging} onClick={() => void deleteProfile()} type="button">
                    {isChanging ? "Deleting…" : "Delete Profile"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}
