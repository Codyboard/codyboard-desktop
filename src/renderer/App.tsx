import { useEffect, useState } from "react";
import { Bluetooth, Keyboard, RefreshCw, Radio, X } from "lucide-react";
import type { HIDDeviceInfo, HIDKeyEvent } from "../shared/hid";
import { Button } from "@/components/ui/button";
import { getHID, hidEvents } from "@/lib/hid";

export default function App() {
  const [devices, setDevices] = useState<HIDDeviceInfo[]>([]);
  const [lastKey, setLastKey] = useState<HIDKeyEvent | null>(null);
  const [status, setStatus] = useState("等待扫描");
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    setScanning(true);
    setStatus("正在扫描 type 40…");
    try {
      const connection = await getHID({ type: 40 });
      setDevices(connection.devices);
      setStatus(connection.devices.length ? `已监听 ${connection.devices.length} 类设备` : "未找到 type 40 设备");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    const offDown = hidEvents.on("keydown", setLastKey);
    const offConnected = hidEvents.on("deviceconnected", (device) => {
      setDevices((current) => current.some(({ id }) => id === device.id) ? current : [...current, device]);
    });
    const offDisconnected = hidEvents.on("devicedisconnected", (device) => {
      setDevices((current) => current.filter(({ id }) => id !== device.id));
    });
    const offError = hidEvents.on("error", ({ message }) => setStatus(message));
    void scan();
    return () => { offDown(); offConnected(); offDisconnected(); offError(); };
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-8 pb-8 pt-14">
        <header className="flex items-start justify-between border-b border-border pb-7">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              <Radio className="h-3.5 w-3.5" /> Native HID monitor
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Codyboard Presenter</h1>
            <p className="mt-2 text-sm text-muted-foreground">BLE 遥控器 · macOS 输入诊断</p>
          </div>
          <Button variant="outline" className="h-8 w-8 px-0" onClick={() => window.codyboard.window.hide()} aria-label="隐藏窗口">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <section className="grid flex-1 gap-4 py-6 md:grid-cols-[1.4fr_0.6fr]">
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold">HID 设备</h2>
                <p className="mt-1 text-xs text-muted-foreground">过滤条件：type = 40</p>
              </div>
              <Button onClick={scan} disabled={scanning}>
                <RefreshCw className={`h-4 w-4 ${scanning ? "animate-spin" : ""}`} />重新扫描
              </Button>
            </div>
            {devices.length ? (
              <div className="space-y-2">
                {devices.map((device) => (
                  <div key={device.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/60 p-3">
                    <div className="rounded-md bg-primary/10 p-2 text-primary"><Bluetooth className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{device.product ?? "Unknown HID device"}</p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{device.transport ?? "unknown"} · {device.vendorId ?? "?"}:{device.productId ?? "?"} · id {device.id}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed border-border text-center">
                <Bluetooth className="mb-3 h-6 w-6 text-muted-foreground" />
                <p className="text-sm font-medium">没有匹配的设备</p>
                <p className="mt-1 text-xs text-muted-foreground">请先在 macOS 蓝牙设置中连接 Presenter</p>
              </div>
            )}
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-2"><Keyboard className="h-4 w-4 text-primary" /><h2 className="font-semibold">最后按键</h2></div>
            <div className="flex flex-1 items-center justify-center py-8">
              {lastKey ? (
                <div className="text-center">
                  <kbd className="inline-flex min-w-16 justify-center rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 font-mono text-xl text-primary shadow-[0_0_24px_hsl(var(--primary)/0.08)]">{lastKey.key}</kbd>
                  <p className="mt-3 font-mono text-[11px] text-muted-foreground">page {lastKey.usagePage} · code {lastKey.code}</p>
                </div>
              ) : <p className="text-xs text-muted-foreground">按下遥控器上的任意按键</p>}
            </div>
            <div className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">{status}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
