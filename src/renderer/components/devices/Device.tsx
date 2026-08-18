import type { ReactNode } from "react";

export interface DeviceProps {
  keyboardType?: number;
  children: ReactNode;
  className?: string;
}

/** Layout boundary shared by future physical-device renderers. */
export function Device({ keyboardType, children, className = "" }: DeviceProps) {
  return (
    <section className={`device-stage ${className}`.trim()} data-keyboard-type={keyboardType}>
      {children}
    </section>
  );
}
