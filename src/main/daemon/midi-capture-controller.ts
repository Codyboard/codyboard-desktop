export interface MIDICaptureClient {
  setMIDICapture(deviceId?: string): Promise<unknown>;
}

export class MIDICaptureController {
  private ownerId?: string;

  constructor(private readonly client: MIDICaptureClient) {}

  async claim(deviceId: string, ownerId: string): Promise<void> {
    validateCaptureRequest(deviceId, ownerId);
    this.ownerId = ownerId;
    try {
      await this.client.setMIDICapture(deviceId);
    } catch (error) {
      if (this.ownerId === ownerId) this.ownerId = undefined;
      throw error;
    }
  }

  async release(ownerId?: string): Promise<void> {
    if (ownerId !== undefined && this.ownerId !== ownerId) return;
    this.ownerId = undefined;
    await this.client.setMIDICapture();
  }
}

function validateCaptureRequest(deviceId: string, ownerId: string): void {
  if (typeof deviceId !== 'string' || !deviceId.trim())
    throw new Error('Invalid MIDI capture device');
  if (typeof ownerId !== 'string' || !ownerId.trim())
    throw new Error('Invalid MIDI capture owner');
}
