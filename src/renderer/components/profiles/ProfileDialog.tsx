import { X } from "lucide-react";
import { type FormEvent, type RefObject } from "react";
import { createPortal } from "react-dom";

import type { ProfileDraft } from "../../../shared/hid";

export function ProfileDialog({
  activeProfile,
  close,
  createProfile,
  deleteProfile,
  dialog,
  error,
  isChanging,
  nameInput,
  newProfileName,
  pendingDeletion,
  setNewProfileName,
}: {
  activeProfile?: ProfileDraft;
  close: () => void;
  createProfile: (event: FormEvent) => Promise<void>;
  deleteProfile: () => Promise<void>;
  dialog: "create" | "delete";
  error?: string;
  isChanging: boolean;
  nameInput: RefObject<HTMLInputElement | null>;
  newProfileName: string;
  pendingDeletion?: ProfileDraft;
  setNewProfileName: (name: string) => void;
}) {
  return createPortal(
    <div className="profile-dialog-backdrop" onMouseDown={(event) => {
      if (event.currentTarget === event.target && !isChanging) close();
    }}>
      <section aria-labelledby="profile-dialog-title" aria-modal="true" className="profile-dialog" role="dialog">
        <button aria-label="Close" className="profile-dialog-close" disabled={isChanging}
          onClick={close} type="button"><X aria-hidden="true" /></button>
        {dialog === "create"
          ? <form onSubmit={(event) => void createProfile(event)}>
              <span className="profile-dialog-eyebrow">Profiles</span>
              <h2 id="profile-dialog-title">Add New Profile</h2>
              <p>Start with a copy of {activeProfile?.name ?? "Default"}, then customize its mappings.</p>
              <label htmlFor="new-profile-name">Profile name</label>
              <input autoComplete="off" id="new-profile-name" maxLength={48}
                onChange={(event) => setNewProfileName(event.target.value)} placeholder="e.g. Presentations"
                ref={nameInput} value={newProfileName} />
              {error && <p className="profile-dialog-error" role="alert">{error}</p>}
              <div className="profile-dialog-actions">
                <button disabled={isChanging} onClick={close} type="button">Cancel</button>
                <button className="is-primary" disabled={isChanging || !newProfileName.trim()} type="submit">
                  {isChanging ? "Creating…" : "Create Profile"}
                </button>
              </div>
            </form>
          : <div>
              <span className="profile-dialog-eyebrow">Profiles</span>
              <h2 id="profile-dialog-title">Delete {pendingDeletion?.name}?</h2>
              <p>This permanently removes the profile and its custom mappings. Default will remain available.</p>
              {error && <p className="profile-dialog-error" role="alert">{error}</p>}
              <div className="profile-dialog-actions">
                <button disabled={isChanging} onClick={close} type="button">Cancel</button>
                <button className="is-destructive" disabled={isChanging}
                  onClick={() => void deleteProfile()} type="button">
                  {isChanging ? "Deleting…" : "Delete Profile"}
                </button>
              </div>
            </div>}
      </section>
    </div>,
    document.body,
  );
}
