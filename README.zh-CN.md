# Pet Pomodoro

[![GitHub License](https://img.shields.io/github/license/Xmemo/codex-pet-pomodoro)](LICENSE)
[![GitHub Releases](https://img.shields.io/github/v/release/Xmemo/codex-pet-pomodoro)](https://github.com/Xmemo/codex-pet-pomodoro/releases)

[English](README.md) | 简体中文

**Human Life × 超昼夜节律 × 番茄钟，与 Codex 电子宠物一起**

一款受 Huberman Lab 超昼夜节律讨论启发的 macOS 番茄钟。专注时，它贴着 Codex 电子宠物安静计时；该休息时，同一只宠物放大，以平静的待机姿态给工作一个明显的“暂停”信号。

> [!WARNING]
> **非官方免责声明**：本项目是独立的社区工具，与 OpenAI 无关联，也未获得其认可。本项目不捆绑 OpenAI 徽标或官方宠物资产。

---

## 它与普通番茄钟有什么不同

**有科学依据的节奏设计。** Huberman Lab 的专注工具包强调有边界的专注与有意识的恢复。Pet Pomodoro 把超昼夜节律的启发转成三种可选择的工作/休息节奏；它们是供个人尝试的起点，不是“每个人的大脑都严格按同一时钟运转”的断言。

**让宠物产生暂停感。** 工作时，小番茄表盘伴随原有的 Codex 电子宠物。到休息节点，宠物从原位置放大，保持安静、低动态的待机状态，让休息在视觉上无法轻易忽略，但不会锁屏或拦截鼠标。

- **25/50/90 三种节奏**：为不同工作提供三个起点：
  - `25`（标准番茄钟 / 25分钟工作，5分钟休息）
  - `50`（心流模式 / 50分钟工作，10分钟休息）
  - `90`（深度专注 / 90分钟工作，20分钟休息）
- **宠物接管式休息**：工作结束时，原有宠物变成大型、低动态的恢复提示，而不是另开一个独立计时器窗口。
- **用于 AI 分析的本地记录**：目标、计时事件和完成状态保存在 SQLite，可由用户导出为 JSON 进行分析。
- **本地优先运行**：无云端依赖、遥测、托管看板或运行时联网要求。

---

## 工作流程

1. 选择 `25/5`、`50/10` 或 `90/20`。
2. 让紧凑番茄表盘与 Codex 小宠物陪伴专注。
3. 休息开始时，宠物放大为全屏、低动态的待机状态。
4. 让明显的视觉转换打断继续工作，建立真正的恢复边界。
5. 保留本地周期历史，供后续复盘或 AI 辅助分析工作模式。

---

## Huberman Lab、超昼夜节律与 90 分钟

Huberman Lab 的 *Focus Toolkit* 建议把专注段控制在约 90 分钟以内，并在之后进行主动卸载或有意识地放松。这个有影响力的科学传播框架，是 `90/20` 选项的产品灵感。

相关研究也支持产品采用的机制：

- 真实学习场景研究发现，预先安排休息相较自行决定休息，与更少的疲劳和分心、更高的专注与动机相关。
- Meta 分析支持短暂休息对提升活力、降低疲劳的整体作用。
- 汇总 158 项研究的 Meta 分析显示，时间管理与表现和幸福感存在中等程度关联。
- 系统综述显示，电脑提示能够显著改变休息或活动行为。

`90/20` 仍是可选实验起点，不是生理处方。研究没有证明某个精确间隔适合所有人和任务，本软件本身也没有经过临床效果试验。完整证据、功能映射和声明范围见[科学依据与声明边界](docs/research/scientific-basis.zh-CN.md)。

---

## 范围与限制

- **无已签名二进制文件**：源码在安装过程中使用 Xcode Command Line Tools 在本地编译。我们不分发预编译、已进行代码签名的二进制文件。
- **显示环境差异**：显示器排列、刘海屏设置和 macOS 空间可能影响布局。
- **无跨平台支持**：使用 Swift、AppKit 和 LaunchAgents 专为 macOS 原生构建。不支持 Windows、Linux 和移动操作系统。
- **无内置 AI、Review 界面或云端看板**：计时器会保存本地周期记录并提供 CLI 历史导出，但 v0.1.0 的精简面板不采集 Review。它不会上传数据、自动调用模型、评价生产力或提供托管分析面板。
- **非医疗建议**：本项目是专注计时器，不是医疗器械，也不用于治疗注意力、睡眠或其他健康问题。
- **无官方关联**：与 OpenAI 或任何官方项目无关。

---

## 前置条件

- **macOS**。
- **Python 3.11 或更高版本**（可用作可执行的 Python）。
- **Node.js**。安装程序会首先尝试使用 Codex 或 ChatGPT 内置的 Node，如果不可用则退而使用 `PATH` 中的 `node`。
- **Xcode Command Line Tools**（需提供 `xcrun swiftc` 以编译 Swift 渲染器）。

---

## 宠物兼容性

兼容的 Codex 宠物包无需附加素材即可与陪伴引擎协同工作。引擎读取配置的宠物 ID，并使用标准图集（atlas）：

- 进入状态：使用中性首帧完成几何放大
- 休息状态：保持平静待机；Rocky 约每三秒执行一次受限眨眼序列，未配置专属档案的宠物保持稳定待机帧
- 退出状态：保持当前帧完成几何收缩

自定义宠物从 `~/.codex/pets` 读取。对于兼容的内置宠物，Provider 只读访问已安装应用 ASAR 中匹配的单个图集条目，并在本地缓存该条目；不会修改应用，也不会重新分发图集。

增强型宠物包可以在 `pet.json` 旁附带 `companion.json`，以提供专用的 `enter`、`rest` 和 `exit` 动画片段（支持 schemaVersion 1 帧文件或 schemaVersion 2 的 atlasFrames/restHeightRatio）。详见：

- [companion-json-schema.md](docs/contracts/companion-json-schema.md)
- [examples/example-pet/](examples/example-pet/)

验证宠物包：

```bash
node bin/codex-pet-companion.js validate-pet examples/example-pet
```

预览已安装的宠物包：

```bash
codex-pet-companion preview --pet example-pet --state rest
```

预览会从标准的 Codex 宠物目录中加载宠物。内置的 `examples/example-pet` 包是一个用于验证和测试的几何示例。

> [!IMPORTANT]
> **无专有资产**：此开源仓库**不**打包或捆绑任何来自官方平台的专有宠物资产或图形。仓库中仅包含最简的几何演示包。

---

## 使用 Codex 安装

如需通过 Codex 安装，请将以下单行指令复制并粘贴到您的 Codex 代理（Agent）中：

> 根据 https://github.com/Xmemo/codex-pet-pomodoro 仓库中的 [INSTALL_WITH_CODEX.md](INSTALL_WITH_CODEX.md) 契约安装 Pet Pomodoro，运行锁定在 `v0.1.0` 版本的 `scripts/bootstrap.sh` 并进行严格的 SHA256 校验，确保不修改 `ChatGPT.app` 或 `Codex.app`，并汇报 `ultradian` 和 `codex-pet-companion` 的状态报告。

*注意：在安装过程中，Codex 可能会向您请求网络和文件系统的访问权限审批。*

Release 压缩包与 `SHA256SUMS` 由同一发布者提供；校验能发现文件不匹配，不能独立证明发布者没有被入侵。首次安装前仍应查看仓库和 Release 来源。

---

## 手动安装

在仓库根目录下运行：

```bash
./scripts/install.sh
```

安装程序会将项目复制到当前用户的本地应用数据目录中，在 `~/.local/bin` 下安装 CLI 包装器，并写入以下 LaunchAgents：

- `~/Library/LaunchAgents/io.github.codex-ultradian-rhythm.plist`
- `~/Library/LaunchAgents/io.github.codex-pet-companion.plist`

在提交新 Payload 之前，会执行 Payload 暂存、编译和激活交换的回滚机制。如果提交后计时器服务启动失败，将尝试恢复显式配置的历史服务；如果陪伴端失败，则会停止陪伴服务，但保留已验证的新计时器和现有状态。

---

## 命令行接口 (CLI)

### 计时器命令

```bash
ultradian status
ultradian status --json
ultradian start start --goal "起草发布说明"
ultradian start flow --goal "完成安装器测试"
ultradian start deep --goal "撰写架构章节"
ultradian start deep --goal "替换当前周期" --replace
ultradian pause
ultradian resume
ultradian stop
ultradian repeat
ultradian history --limit 50 --json
ultradian notify-test
```

### 陪伴端命令

```bash
codex-pet-companion validate-pet <path>
codex-pet-companion preview --pet <id> --state enter
codex-pet-companion preview --pet <id> --state rest
codex-pet-companion preview --pet <id> --state exit
codex-pet-companion start
codex-pet-companion stop
codex-pet-companion status
codex-pet-companion config set pet auto
codex-pet-companion config set pet <id>
```

命令行契约详见 [cli-commands.md](docs/contracts/cli-commands.md) 与 [visual-event-protocol.md](docs/contracts/visual-event-protocol.md)。历史字段、导出流程和可复用 AI 分析提示词见[本地数据与 AI 分析](docs/data-and-ai-analysis.md)。

---

## 隐私与安全

- **完全本地化操作**：无遥测、无远程分析或远程日志。除非您主动导出并分享，否则周期记录不会离开本机。
- **无后台网络活动**：应用程序不会监听任何公开端口，也不会连接到外部服务器。
- **干净的执行环境**：完全运行在用户空间目录上下文中（`~/.local/` 和标准的 macOS 路径）。
- **记录可检查**：历史周期保存在 `~/.codex/ultradian-rhythm/sessions.sqlite`。可使用 `ultradian history --limit 50 --json` 只读导出。

---

## 疑难解答

- **Swift 渲染器编译失败**：请确保已通过 `xcode-select --install` 安装了 Xcode 命令行工具。
- **找不到 CLI 命令**：请确保已将 `~/.local/bin` 添加到终端环境的 `PATH` 变量中。
- **LaunchAgents 没有运行**：使用 `launchctl list | grep codex` 检查状态，或查看 `~/Library/Logs/` 下的日志文件。

---

## 卸载

默认卸载将移除 LaunchAgents 和已安装的二进制文件，同时保留计时器状态：

```bash
./scripts/uninstall.sh
```

如需同时清除本地计时器状态，请运行：

```bash
./scripts/uninstall.sh --purge-state
```

---

## 路线图

- [ ] 支持自定义悬浮窗口坐标与刘海屏规避。
- [ ] 优化半透明悬浮面板渲染选项。
- [ ] 扩展自定义帧率的 schema 定义。
- [ ] 基于现有历史导出增加可选的本地报告。

---

## 参与贡献

欢迎大家提交贡献！请查阅 [CONTRIBUTING.md](CONTRIBUTING.md) 以了解如何提交 Issue 和 Pull Request。

---

## 开源许可证

本项目基于 [MIT 许可证](LICENSE) 开源。
