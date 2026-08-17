import { useEffect, useState } from "react";
import type { HIDDiagnosticEvent } from "../shared/hid";

export default function App() {
  const [event, setEvent] = useState<HIDDiagnosticEvent>();

  useEffect(() => window.codyboard.diagnostics.onKey(setEvent), []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-8 text-foreground">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">Live input</p>
            <h1 className="mt-2 text-xl font-semibold">Keyboard Type 40</h1>
          </div>
          <span className="flex items-center gap-2 text-xs text-emerald-400">
            <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_currentColor]" /> Listening
          </span>
        </div>

        <div className="mt-8 rounded-xl border border-border bg-background/70 px-6 py-10 text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {event?.source === "hidUsage" ? "HID Usage" : "Keycode"}
            </p>
          <p className="mt-3 font-mono text-7xl font-semibold tabular-nums tracking-tight">
            {event ? (event.source === "hidUsage" ? `0x${event.code.toString(16).toUpperCase()}` : event.code) : "—"}
          </p>
          <p className="mt-4 h-5 font-mono text-xs text-muted-foreground">
            {event ? `${event.eventType} · flags ${event.flags}` : "Press a key on the type 40 keyboard"}
          </p>
        </div>
      </section>
    </main>
  );
}
