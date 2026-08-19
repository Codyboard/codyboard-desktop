import { useEffect, useState } from "react";

import { MidiAudioEngine, type MidiEngineSnapshot } from "./audio-engine";

export function useMidiEngine(): {
  engine?: MidiAudioEngine;
  snapshot?: MidiEngineSnapshot;
} {
  const [engine, setEngine] = useState<MidiAudioEngine>();
  const [snapshot, setSnapshot] = useState<MidiEngineSnapshot>();
  useEffect(() => {
    const next = new MidiAudioEngine();
    setEngine(next);
    const unsubscribe = next.onState(setSnapshot);
    return () => { unsubscribe(); next.dispose(); };
  }, []);
  return { engine, snapshot };
}
