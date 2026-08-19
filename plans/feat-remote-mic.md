# Remote Mic 迁移

## 背景

把小米遥控器的 BLE ATVV 音频接入 Codyboard，输出到本机回环音频设备，并支持通用按键触发。Power 已由用户独立完成，不属于本迁移。技术细节见 [可行性规格](/Users/henry/Desktop/codyboard-desktop/plan/remote-mic-migration-feasibility.md)。

## 方案

每个 Phase 独立提交；目标测试和全量门禁通过后才进入下一 Phase。

状态：Phase 0–3 完成，QuickTime 已验证 loud and clear。后续 Phase 不修改 Power。

### 0. 隔离工作区

- 从当前 `main` HEAD 创建 `codex/remote-mic` worktree。
- 将当前未提交的 power-protection WIP 复制到新 worktree，原工作区保持不变。
- 审核 WIP，运行基线：`pnpm lint && pnpm test && pnpm test:native && pnpm build`。

### 1. 电源键保护（用户已完成）

- 保留现有实现，不纳入后续 remote-mic 迁移改动。

### 2. ATVV 与 BLE

- 新增纯 `ATVVProtocol`、IMA ADPCM decoder、frame accumulator 及测试。
- 新增 `XiaomiVoiceBluetoothController`：GATT discovery、capabilities、16 kHz gate、start/audio/stop、generation-safe reconnect。
- daemon 增加 voice 配置、状态命令和结构化事件；PCM 留在 Swift。
- 打包 App 增加蓝牙用途说明，真机验证权限、连接和重复短流。

### 3. CoreAudio 输出

- 新增设备枚举与 `VirtualAudioOutput`：16 kHz mono、显式设备绑定、buffer drain、live health。
- 从固定 BlackHole 源码构建独立的 `Codyboard Virtual Microphone`；使用 Codyboard 专属 bundle、UID 和 factory UUID。
- 本机自用仅 ad-hoc 签名；不引入安装器、Developer ID 或公证流程。
- 覆盖短语音尾音、stale player、路由变化和空闲释放。
- 自动验证回环音频；QuickTime 由用户补充验证，不阻塞后续 Phase。

### 4. 语音触发状态机

- 新增 `VoiceSessionController`，实现 Fn 和可配置组合键的按下、点按及切换语义。
- 复用 `KeyboardSimulator` 的 modifier ledger；所有失败、断连和退出路径成对释放按键。
- stop 顺序固定为：停止接收 → drain → 结束 trigger。
- native 层不包含产品名、应用识别或产品专属预设。

### 5. Electron 配置与 UI

- 新增 `VoiceCoordinator`，扩展 daemon client、IPC、preload 和 shared types。
- 在 `~/.codyboard/settings.yaml` 持久化 voice/audio 配置，不进入 profile YAML。
- 小米设备页增加 BLE 状态、输出设备、测试音、增益和 trigger mode；voice 保持专用，Power 继续使用 profile mapping。
- MIDI capture 期间暂停 voice trigger，释放后恢复原配置。

### 6. 恢复与验收

- 补齐 target readiness/pre-roll、睡眠唤醒、CoreAudio 重绑、daemon crash cleanup。
- 验证无 active profile/voice trigger 时不创建 Event Tap、不请求 Accessibility。
- 运行全量门禁和 RC003 验收矩阵；记录 60 秒以上真实行为，不推测 `MIC_EXTEND`。
- 本机自用保持 ad-hoc 签名，不做 Developer ID、公证或 driver 安装器。

## 关键文件

| 文件 | 变更 | 说明 |
| --- | --- | --- |
| `native/Sources/CodyboardDaemon/ATVVProtocol.swift` | add | 协议、decoder、framing |
| `native/Sources/CodyboardDaemon/XiaomiVoiceBluetoothController.swift` | add | CoreBluetooth 生命周期 |
| `native/Sources/CodyboardDaemon/VirtualAudioOutput.swift` | add | CoreAudio 输出与 drain |
| `scripts/build-virtual-microphone.sh` | add | 固定源码构建 Codyboard 虚拟麦克风 |
| `scripts/install-virtual-microphone.sh` | add | 本机开发安装；不打包、不分发 |
| `native/Sources/CodyboardDaemon/VoiceSessionController.swift` | add | trigger/audio 会话状态机 |
| `native/Sources/CodyboardDaemon/NativeModels.swift` | modify | voice/audio 命令与事件类型 |
| `src/main/voice/voice-coordinator.ts` | add | Electron 编排与设置 |
| `src/shared/codyboard-api.ts` | modify | renderer API |
| `src/renderer/pages/DeviceDetailPage.tsx` | modify | 小米语音设置 UI |

## 验证

- 每 Phase：相关单元测试，再运行 `pnpm lint && pnpm test && pnpm test:native && pnpm build`。
- Phase 2–4：RC003 首次短语音成功，QuickTime 有完整首尾音，Fn/快捷键严格成对。
- Phase 6：断连重连、快速连续语音、权限撤销、睡眠唤醒、MIDI capture、60 秒长按全部真机验证。
