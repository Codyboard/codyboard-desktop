import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import type { HIDDeviceInfo, HIDEventMap, HIDEventName, HIDFilter } from "../shared/hid.js";

interface NativeMessage {
  id?: string;
  event?: HIDEventName | "ready";
  ok?: boolean;
  data?: unknown;
  error?: string;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timeout: NodeJS.Timeout;
}

export class HIDBridge extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private sequence = 0;
  private readonly pending = new Map<string, PendingRequest>();

  constructor(private readonly executablePath: string) {
    super();
  }

  start(): void {
    if (this.child) return;

    const child = spawn(this.executablePath, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => this.handleLine(line));
    createInterface({ input: child.stderr }).on("line", (line) => this.emit("error", { message: line }));
    child.once("error", (error) => this.fail(error));
    child.once("exit", (code, signal) => {
      this.child = undefined;
      this.fail(new Error(`HID helper exited (${signal ?? code ?? "unknown"})`));
    });
  }

  async get(filter: HIDFilter): Promise<HIDDeviceInfo[]> {
    const devices = await this.request<HIDDeviceInfo[]>("get", filter);
    await this.request("watch", filter);
    return devices;
  }

  stop(): void {
    this.child?.kill("SIGTERM");
    this.child = undefined;
  }

  private request<T = void>(method: string, filter?: HIDFilter): Promise<T> {
    this.start();
    const id = String(++this.sequence);
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native HID request timed out: ${method}`));
      }, 5_000);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout
      });
      this.child!.stdin.write(`${JSON.stringify({ id, method, filter })}\n`);
    });
  }

  private handleLine(line: string): void {
    let message: NativeMessage;
    try {
      message = JSON.parse(line) as NativeMessage;
    } catch {
      this.emit("error", { message: `Malformed native response: ${line}` });
      return;
    }

    if (message.id) {
      const request = this.pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timeout);
      this.pending.delete(message.id);
      if (message.ok) request.resolve(message.data);
      else request.reject(new Error(message.error ?? "Native HID request failed"));
      return;
    }

    if (message.event && message.event !== "ready") {
      if (message.event === "error") this.emit("error", { message: message.error ?? "Native HID error" });
      else this.emit(message.event, message.data);
    }
  }

  private fail(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timeout);
      request.reject(error);
    }
    this.pending.clear();
    this.emit("error", { message: error.message });
  }
}

export interface HIDBridge {
  on<K extends HIDEventName>(event: K, listener: (payload: HIDEventMap[K]) => void): this;
}
