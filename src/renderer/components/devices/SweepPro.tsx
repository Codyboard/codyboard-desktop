import type { XiaomiRemoteProps } from "./XiaomiRemote";

export type SweepProProps = XiaomiRemoteProps;

const keys = Array.from({ length: 15 }, (_, index) => index + 1);

export function SweepPro({ ariaLabel = "Sweep Pro macropad" }: SweepProProps) {
  return (
    <>
      <div className="sweep-pro-shadow" aria-hidden="true" />
      <section className="sweep-pro" aria-label={ariaLabel}>
        <div className="sweep-pro-chassis" aria-hidden="true" />
        <div className="sweep-pro-display" aria-label="Display" />

        <div className="sweep-pro-keybed" aria-label="Macro keys">
          {keys.map((key) => (
            <button type="button" aria-label={`Macro key ${key}`} key={key} />
          ))}
        </div>

        <div className="sweep-pro-side-controls">
          <button type="button" className="sweep-pro-corner-key" aria-label="Corner key" />
          <button type="button" className="sweep-pro-side-key" aria-label="Side key" />
          <button type="button" className="sweep-pro-knob" aria-label="Rotary knob" />
        </div>
      </section>
    </>
  );
}
