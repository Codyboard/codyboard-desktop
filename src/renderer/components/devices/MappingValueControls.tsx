import { X } from "lucide-react";

import type { MappingOutput } from "../../../shared/hid";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

import type { DeviceControl } from "./device-controls";
import { KEY_OUTPUT_GROUPS, KEY_OUTPUT_OPTIONS } from "./mapping-output-presets";

export function ActionSelect<Key extends string>({ control, disabled, isApplicationScope, onChange, value }: {
  control: DeviceControl<Key>; disabled: boolean; isApplicationScope: boolean;
  onChange: (value: string) => void; value: string;
}) {
  return <div className="mapping-action-select"><Select disabled={disabled} onValueChange={onChange} value={value}>
    <SelectTrigger aria-label={`${control.label} action`}><SelectValue /></SelectTrigger>
    <SelectContent>
      {isApplicationScope && <SelectItem value="unchanged">Unchanged</SelectItem>}
      {isApplicationScope && <SelectSeparator />}
      <SelectItem value="keystroke">Key Press</SelectItem>
      {control.input.kind !== "voice" && <>
        <SelectItem value="launch">Launch Application</SelectItem>
        <SelectItem value="open-url">Open URL</SelectItem>
        <SelectItem value="type-text">Type Text</SelectItem>
      </>}
    </SelectContent>
  </Select></div>;
}

export function PresetSelect<Key extends string>({ control, disabled, saveOutput }: {
  control: DeviceControl<Key>; disabled: boolean;
  saveOutput: (control: DeviceControl<Key>, output: MappingOutput) => Promise<boolean>;
}) {
  return <span className="key-output-select"><Select disabled={disabled} onValueChange={(value) => {
    const option = KEY_OUTPUT_OPTIONS.get(value);
    if (option) void saveOutput(control, structuredClone(option.output));
  }} value=""><SelectTrigger aria-label={`Choose a special key for ${control.label}`} className="key-output-trigger"><span className="sr-only">Choose a special key</span></SelectTrigger>
    <SelectContent align="end" className="key-output-menu">{KEY_OUTPUT_GROUPS.map((group) => <SelectGroup key={group.label}>
      <SelectLabel>{group.label}</SelectLabel>{group.options.map((option) => <SelectItem key={option.id} value={option.id}><span className="key-output-option"><option.icon aria-hidden="true" /><span>{option.label}</span></span></SelectItem>)}
    </SelectGroup>)}</SelectContent>
  </Select></span>;
}

export function ClearMappingButton<Key extends string>({ control, disabled, onClear, saveOutput }: {
  control: DeviceControl<Key>; disabled: boolean;
  onClear?: () => void;
  saveOutput: (control: DeviceControl<Key>, output: MappingOutput) => Promise<boolean>;
}) {
  return <button aria-label={`Clear ${control.label}`} className="mapping-value-clear" disabled={disabled}
    onClick={() => { onClear?.(); void saveOutput(control, { kind: "suppress" }); }}
    type="button"><X aria-hidden="true" /></button>;
}
