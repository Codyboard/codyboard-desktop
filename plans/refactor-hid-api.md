# HID API 面向对象重构

## 背景

当前 `getHID()` 返回伪设备数组、Swift 只保存一个全局 `activeFilter`，事件又通过全局广播发送，无法表达多个监听会话、物理设备身份、生命周期或按键模拟。目标是建立诚实区分“物理 HID 目录”和“CGEvent 键盘事件源”的对象模型，并为多设备、系统按键、Fn、权限和后续映射引擎留下稳定边界。

## 方案

### 1. 定义公开对象模型与领域类型 — `src/shared/hid.ts`（修改）

- 公共入口改为 `CodyboardNative`，包含 `devices: HIDDeviceManager` 与 `keyboard: KeyboardController`。
- `HIDDeviceManager.list(options)` 返回不可变 `HIDDevice` 描述对象；区分会话期 `registryId` 与可持久化 `fingerprint`，默认过滤虚拟设备。
- `KeyboardController.monitor({ keyboardType })` 返回有唯一 `id`、`on("input")`、`close()` 的 `KeyboardMonitor`；事件使用 `kind` 判别联合统一表示 `keyDown`、`keyUp`、`flagsChanged`、`systemDefined`。
- `KeyboardController.send(output)` 接受 `KeyboardStroke` 或 `SystemKeyStroke`；修饰键包含 Command、Control、Option、Shift、Fn。物理设备 ID 设为可选，因为 CGEvent 无法把 `systemDefined` 可靠归因到某个实体 HID。

### 2. 将 Swift 单文件拆为领域对象 — `native/Sources/CodyboardHIDHelper/`（修改/新增）

- 保留 `main.swift` 只负责组装和 RunLoop；新增 `NativeModels.swift`、`HIDDeviceManager.swift`、`KeyboardController.swift`、`NativeCommandServer.swift`。
- `HIDDeviceManager` 封装 IOHID 枚举、虚拟设备判断和 fingerprint；枚举路径不调用 `IOHIDManagerOpen`，确保与 Karabiner 等独占客户端共存。
- `KeyboardController` 拥有 Event Tap、按订阅 ID 保存多个 monitor、解析四类事件并扇出；Tap 超时恢复和主线程状态变更留在该对象内。
- 将当前 Codex 实验映射隔离为可替换的 `EventTransformer`，Event Tap 本身不包含产品规则。

### 3. 增加原生按键模拟与递归保护 — `native/Sources/CodyboardHIDHelper/KeyboardController.swift`（新增）

- 普通键通过 `CGEvent` 成对发送；Fn 使用 keycode `63`、`flagsChanged` 和 `.maskSecondaryFn`；媒体键通过 subtype `8` 的 `systemDefined` `NSEvent` 发送。
- 给合成事件写入固定 `eventSourceUserData` 标记，默认不再投递给 monitor，避免“监听 → 映射 → 模拟 → 再监听”的递归循环。
- 所有输出保证 down/up 配对，并在中途失败时释放已按下的修饰键。

### 4. 版本化 JSON IPC 与进程生命周期 — `src/main/hid-bridge.ts`、`native/Sources/CodyboardHIDHelper/NativeCommandServer.swift`（修改/新增）

- 协议统一为 `{ id, method, params }`、结构化 `{ code, message, details }` 错误及 `{ subscriptionId, event, payload }` 事件；方法命名为 `devices.list`、`monitor.open/close`、`keyboard.send`、`permissions.status/request`。
- `HIDBridge` 只负责子进程、超时、协议校验和状态机，不再承载 HID 领域语义；helper 退出时拒绝 pending 请求并使所有 monitor 明确进入 closed 状态。
- 首次握手校验协议版本，避免 Electron 与打包进 resources 的旧 helper 静默错配。

### 5. 在 renderer 构造真正的类实例 — `src/preload/preload.ts`、`src/renderer/lib/hid.ts`（修改）

- preload 只暴露不可伪造的最小 transport：`request(method, params)` 和按 subscription ID 订阅事件；class 不跨 contextBridge 传输。
- renderer 端实现 `CodyboardNative`、`HIDDeviceManager`、`KeyboardController`、`KeyboardMonitor`，负责 typed listener、幂等 `close()` 和资源清理。
- 删除 `getHID()`、`hidEvents` 与全局事件总线；当前实验 UI 改用一个 monitor，窗口卸载时关闭它。该 API 是有意的破坏性重构，实验 UI 不保留兼容适配层。

### 6. 权限与 Electron 生命周期显式化 — `src/main/main.ts`（修改）

- App 启动只启动 native transport，不隐式弹权限提示；`permissions.request()` 由首次创建 monitor 或 UI 操作触发。
- monitor 属于主进程服务生命周期，renderer 隐藏不关闭；renderer 销毁或 App 退出时释放对应订阅，systray 存活期间继续运行。
- 前台 App 信息作为输入事件快照的一部分返回，映射层按 bundle identifier 判断，不再让 UI 跨进程查询。

### 7. 建立协议和原生单元测试 — `native/Tests/CodyboardHIDHelperTests/`、`src/shared/hid.test.ts`（新增）

- Swift 测试覆盖虚拟 HID 分类、systemDefined 编解码、Fn 状态、事件 transformer 和 IPC 错误；模拟测试只验证事件构造，不实际向系统发键。
- TS 测试覆盖多个 monitor 的事件隔离、close 幂等、超时/进程退出和协议版本不匹配；`package.json` 增加 pnpm 测试脚本。
- 保留人工权限验收：Karabiner 开启时列举设备、主窗体隐藏后监听、Codex/其他 App 映射、音量键与 Fn 组合。

## 关键文件

| 文件 | 变更 | 说明 |
|------|------|------|
| `native/Sources/CodyboardHIDHelper/main.swift` | 修改 | 缩减为对象组装和 RunLoop 入口 |
| `native/Sources/CodyboardHIDHelper/NativeModels.swift` | 新增 | Swift 领域模型和版本化 IPC envelope |
| `native/Sources/CodyboardHIDHelper/HIDDeviceManager.swift` | 新增 | IOHID 设备目录、身份与虚拟设备过滤 |
| `native/Sources/CodyboardHIDHelper/KeyboardController.swift` | 新增 | Event Tap、多 monitor、模拟和 transformer |
| `native/Sources/CodyboardHIDHelper/NativeCommandServer.swift` | 新增 | JSON-lines 命令路由、响应与事件输出 |
| `src/shared/hid.ts` | 修改 | 公开对象模型、判别联合和 transport 类型 |
| `src/main/hid-bridge.ts` | 修改 | 收敛为版本化 native process transport |
| `src/main/main.ts` | 修改 | 服务生命周期、IPC 注册和 systray 所有权 |
| `src/preload/preload.ts` | 修改 | 暴露最小 request/subscription transport |
| `src/renderer/lib/hid.ts` | 修改 | 实现 renderer 侧面向对象 API |

## 验证

1. 运行 `pnpm build`，确认 Swift、TypeScript、Electron 与 renderer 全部构建通过。
2. 运行 `pnpm test` 和 `pnpm test:native`，覆盖协议、monitor 隔离、虚拟 HID、媒体键和 Fn 构造。
3. 调用 `CodyboardNative.devices.list()`，默认应返回 4 个实体键盘；传 `{ includeVirtual: true }` 时应包含 Karabiner，共 5 个。
4. 人工授权后创建两个不同 keyboard type 的 monitor，确认事件互不串流；隐藏主窗体后 type 40 仍工作，关闭 monitor 后不再收到事件。
5. 在文本编辑器人工验证普通组合键、Fn 组合和音量/播放键模拟，确认合成事件不会递归触发映射。
