import { AppWindow, Plus, Trash2, X } from "lucide-react";
import { createPortal } from "react-dom";

import type {
  CodyboardApplicationInfo,
  KeyMappingGroup,
} from "../../../shared/hid";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from "../ui/select";

export function MappingScopeHeader({
  applicationGroups,
  applicationInfo,
  changeScope,
  menuOpen,
  pendingRemoval,
  removeScope,
  saving,
  selectedGroup,
  selectedScopeId,
  setMenuOpen,
  setPendingRemovalId,
}: {
  applicationGroups: readonly KeyMappingGroup[];
  applicationInfo: Readonly<Record<string, CodyboardApplicationInfo>>;
  changeScope: (scopeId: string) => Promise<void>;
  menuOpen: boolean;
  pendingRemoval?: KeyMappingGroup;
  removeScope: () => Promise<void>;
  saving: boolean;
  selectedGroup?: KeyMappingGroup;
  selectedScopeId: string;
  setMenuOpen: (open: boolean) => void;
  setPendingRemovalId: (id?: string) => void;
}) {
  const pendingName = pendingRemoval?.scope.kind === "application"
    ? applicationInfo[pendingRemoval.scope.bundleId]?.name ?? pendingRemoval.scope.bundleId
    : undefined;
  return (
    <>
      <header className="mapping-console-header">
        <div className="mapping-console-title"><p>Button map</p><h2>Controls</h2></div>
        <div className="mapping-scope-select">
          <span>Configure for</span>
          <Select disabled={!selectedGroup || saving} onOpenChange={setMenuOpen}
            onValueChange={(value) => void changeScope(value)} open={menuOpen} value={selectedScopeId}>
            <SelectTrigger aria-label="Mapping scope" className="mapping-scope-trigger">
              {selectedGroup?.scope.kind === "application"
                ? <ApplicationIdentity bundleId={selectedGroup.scope.bundleId} info={applicationInfo[selectedGroup.scope.bundleId]} />
                : <span>Global</span>}
            </SelectTrigger>
            <SelectContent align="end" className="mapping-scope-menu">
              <SelectItem value="global"><span>Global</span></SelectItem>
              {applicationGroups.map((group) => {
                const bundleId = group.scope.kind === "application" ? group.scope.bundleId : "";
                const name = applicationInfo[bundleId]?.name ?? bundleId;
                return <div className="mapping-scope-application-option" key={group.id}>
                  <SelectItem value={group.id}><ApplicationIdentity bundleId={bundleId} info={applicationInfo[bundleId]} /></SelectItem>
                  <button aria-label={`Remove ${name} specification`} className="select-row-remove" disabled={saving}
                    onClick={(event) => { event.stopPropagation(); setMenuOpen(false); setPendingRemovalId(group.id); }}
                    onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }} type="button">
                    <Trash2 aria-hidden="true" />
                  </button>
                </div>;
              })}
              <SelectSeparator />
              <SelectItem className="is-add-application mapping-scope-action" value="__add_application__">
                <Plus aria-hidden="true" /><span>Add Specific Application…</span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </header>
      {pendingRemoval?.scope.kind === "application" && createPortal(
        <div className="profile-dialog-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !saving) setPendingRemovalId();
        }}>
          <section aria-labelledby="remove-scope-dialog-title" aria-modal="true" className="profile-dialog" role="dialog">
            <button aria-label="Close" className="profile-dialog-close" disabled={saving}
              onClick={() => setPendingRemovalId()} type="button"><X aria-hidden="true" /></button>
            <div><span className="profile-dialog-eyebrow">Application specification</span>
              <h2 id="remove-scope-dialog-title">Remove {pendingName}?</h2>
              <p>This removes every button override for this application. Your Global mappings will remain unchanged.</p>
              <div className="profile-dialog-actions">
                <button disabled={saving} onClick={() => setPendingRemovalId()} type="button">Cancel</button>
                <button autoFocus className="is-destructive" disabled={saving} onClick={() => void removeScope()} type="button">
                  {saving ? "Removing…" : "Remove Specification"}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}

function ApplicationIdentity({ bundleId, info }: { bundleId: string; info?: CodyboardApplicationInfo }) {
  return <span className="application-select-identity">
    {info?.iconDataUrl ? <img alt="" src={info.iconDataUrl} /> : <AppWindow aria-hidden="true" />}
    <span>{info?.name ?? bundleId}</span>
  </span>;
}
