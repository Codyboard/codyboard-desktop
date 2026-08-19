import { CornerDownLeft, TextCursorInput, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { TypeTextOutput } from "../../../shared/hid";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function TypeTextEditor({ controlLabel, disabled, onCancel, onClear, onSave, output }: {
  controlLabel: string; disabled: boolean; onCancel: () => void; onClear: () => void;
  onSave: (output: TypeTextOutput) => Promise<void>; output?: TypeTextOutput;
}) {
  const [pressEnter, setPressEnter] = useState(output?.pressEnter ?? false);
  const [text, setText] = useState(output?.text ?? "");
  useEffect(() => {
    if (!output) return;
    setPressEnter(output.pressEnter); setText(output.text);
  }, [output]);
  const save = (nextText = text, nextPressEnter = pressEnter) => {
    if (nextText) void onSave({ kind: "typeText", pressEnter: nextPressEnter, text: nextText });
  };
  return <div className="type-text-picker" onBlur={(event) => {
    if (!disabled && (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))) save();
  }}>
    <TextCursorInput aria-hidden="true" className="type-text-icon" />
    <input aria-label={`${controlLabel} text`} autoCapitalize="none" autoCorrect="off" autoFocus={!output}
      className="type-text-value" disabled={disabled} maxLength={4_096}
      onChange={(event) => setText(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") { event.preventDefault(); setPressEnter(output?.pressEnter ?? false); setText(output?.text ?? ""); onCancel(); }
      }} placeholder="Text to type" spellCheck={false} value={text} />
    {(output || text) && <button aria-label={`Clear ${controlLabel} text`} className="mapping-value-clear type-text-clear" disabled={disabled} onClick={onClear} type="button"><X aria-hidden="true" /></button>}
    <TooltipProvider delayDuration={250}><Tooltip><TooltipTrigger asChild><button
      aria-label="Press Enter after typing" aria-pressed={pressEnter} className={`type-text-enter ${pressEnter ? "is-active" : ""}`.trim()}
      disabled={disabled} onClick={() => { const next = !pressEnter; setPressEnter(next); save(text, next); }}
      onPointerDown={(event) => event.preventDefault()} type="button"><CornerDownLeft aria-hidden="true" /></button></TooltipTrigger>
      <TooltipContent side="top">{pressEnter ? "Enter will be pressed after typing" : "Press Enter after typing"}</TooltipContent>
    </Tooltip></TooltipProvider>
  </div>;
}
