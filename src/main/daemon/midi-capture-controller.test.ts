import { describe, expect, it } from "vitest";

import { MIDICaptureController, type MIDICaptureClient } from "./midi-capture-controller";

class FakeCaptureClient implements MIDICaptureClient {
  readonly calls: (string | undefined)[] = [];
  failure?: Error;

  async setMIDICapture(deviceId?: string): Promise<void> {
    this.calls.push(deviceId);
    if (this.failure) throw this.failure;
  }
}

describe("MIDICaptureController", () => {
  it("ignores a stale owner's cleanup after a newer page claims capture", async () => {
    const client = new FakeCaptureClient();
    const capture = new MIDICaptureController(client);
    await capture.claim("sweep-a", "old-page");
    await capture.claim("sweep-a", "new-page");
    await capture.release("old-page");
    expect(client.calls).toEqual(["sweep-a", "sweep-a"]);
    await capture.release("new-page");
    expect(client.calls).toEqual(["sweep-a", "sweep-a", undefined]);
  });

  it("clears a failed claim so application shutdown can still release", async () => {
    const client = new FakeCaptureClient();
    const capture = new MIDICaptureController(client);
    client.failure = new Error("permission denied");
    await expect(capture.claim("sweep-a", "page")).rejects.toThrow("permission denied");
    client.failure = undefined;
    await capture.release();
    expect(client.calls).toEqual(["sweep-a", undefined]);
  });

  it("restores an active capture after daemon restart", async () => {
    const client = new FakeCaptureClient();
    const capture = new MIDICaptureController(client);
    await capture.claim("sweep-a", "page-a");

    await capture.recover();

    expect(client.calls).toEqual(["sweep-a", "sweep-a"]);
  });

  it("validates owner and device identity before changing native state", async () => {
    const client = new FakeCaptureClient();
    const capture = new MIDICaptureController(client);
    await expect(capture.claim("", "page")).rejects.toThrow("Invalid MIDI capture device");
    await expect(capture.claim("sweep-a", "")).rejects.toThrow("Invalid MIDI capture owner");
    expect(client.calls).toEqual([]);
  });
});
