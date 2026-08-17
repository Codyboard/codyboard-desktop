import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";

import type {
  CodyboardPermission,
  CompiledOutput,
  CompiledProfileSet,
  HIDDeviceInfo,
  HIDListOptions,
  NativeError,
  PermissionStatus,
} from "../shared/hid.js";

interface NativeMessage {
  id?: string;
  event?: string;
  ok?: boolean;
  data?: unknown;
  error?: string | NativeError;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(reason: Error): void;
  timeout: NodeJS.Timeout;
}

/** Typed, request-response client for the long-lived Swift daemon. */
export class CodyboardDaemonClient extends EventEmitter {
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
      this.fail(new Error(`Codyboard daemon exited (${signal ?? code ?? "unknown"})`));
    });
  }

  listDevices(options?: HIDListOptions): Promise<HIDDeviceInfo[]> {
    return this.request<HIDDeviceInfo[]>("devices.list", { includeVirtual: options?.includeVirtual ?? false });
  }

  replaceProfiles(snapshot: CompiledProfileSet): Promise<{ generation: number; listening: boolean }> {
    return this.request("profiles.replace", { snapshot });
  }

  sendKeyboardInput(output: CompiledOutput): Promise<void> {
    return this.request("keyboard.send", { output });
  }

  permissionStatus(): Promise<PermissionStatus> {
    return this.request("permissions.status");
  }

  requestPermission(permission: CodyboardPermission): Promise<PermissionStatus> {
    return this.request("permissions.request", { permission });
  }

  setDiagnosticKeyboardType(keyboardType?: number): Promise<{ generation: number; listening: boolean }> {
    return this.request("diagnostics.set", keyboardType === undefined ? {} : { keyboardType });
  }

  stop(): void {
    this.child?.kill("SIGTERM");
    this.child = undefined;
  }

  request<T = void>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    this.start();
    const id = String(++this.sequence);
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native HID request timed out: ${method}`));
      }, 5_000);
      this.pending.set(id, {
        resolve: resolve,
        reject,
        timeout
      });
      this.child!.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
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
      else {
        const error = typeof message.error === "string" ? { code: "nativeError", message: message.error } : message.error;
        request.reject(Object.assign(new Error(error?.message ?? "Native HID request failed"), { code: error?.code, details: error?.details }));
      }
      return;
    }

    if (message.event && message.event !== "ready") {
      if (message.event === "error") {
        const error = typeof message.error === "string" ? message.error : message.error?.message;
        this.emit("error", { message: error ?? "Native HID error" });
      }
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
