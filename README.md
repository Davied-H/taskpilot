# TaskPilot

一款集成 AI 能力的桌面端任务管理应用，基于 [Wails v3](https://v3alpha.wails.io) 构建，前端使用 React + TypeScript，后端使用 Go。

## 功能特性

- **项目管理** — 创建、编辑、删除项目，按项目组织任务
- **任务管理** — 支持任务的增删改查，设置优先级与截止日期
- **今日视图** — 聚焦当天待办与进行中的任务
- **多窗口支持** — 主窗口、快速添加窗口、独立 AI 聊天窗口
- **系统托盘** — 最小化到托盘，快速访问常用功能
- **AI 对话助手** — 通过侧边栏或独立窗口与 AI 对话，自然语言管理任务
- **每日总结** — AI 自动生成今日任务摘要
- **智能建议** — AI 根据现有任务推荐新任务
- **任务拆解** — AI 将复杂任务分解为可执行的子任务
- **优先级分析** — AI 分析并建议任务优先级调整
- **周报生成** — AI 自动生成每周工作进度报告

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Wails v3](https://v3alpha.wails.io) |
| 后端 | Go 1.25+, SQLite |
| 前端 | React 18, TypeScript 5, Vite 5 |
| UI | Tailwind CSS v4, Motion |
| 状态管理 | Zustand |
| AI | Claude API (可配置 Base URL 和模型) |
| 数据存储 | SQLite (`~/.taskpilot/data.db`) |
| 构建工具 | [Task](https://taskfile.dev) |

## 项目结构

```
taskpilot/
├── main.go                  # 应用入口（多窗口、菜单、托盘）
├── Taskfile.yml             # 构建任务配置
├── internal/
│   └── core/core.go         # 核心模块（DB 初始化、Store 管理）
├── services/
│   ├── project_service.go   # 项目服务
│   ├── task_service.go      # 任务服务
│   ├── ai_service.go        # AI 服务
│   └── config_service.go    # 配置服务
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # 主应用组件（含多窗口路由）
│   │   ├── components/          # UI 组件
│   │   │   ├── Sidebar.tsx          # 侧边栏导航
│   │   │   ├── TodayView.tsx        # 今日视图
│   │   │   ├── TaskList.tsx         # 任务列表
│   │   │   ├── TaskItem.tsx         # 任务卡片
│   │   │   ├── TaskForm.tsx         # 任务表单
│   │   │   ├── ProjectForm.tsx      # 项目表单
│   │   │   ├── ChatPanel.tsx        # AI 对话面板
│   │   │   ├── DailySummary.tsx     # 每日总结
│   │   │   └── SettingsView.tsx     # 设置页面
│   │   ├── views/
│   │   │   └── QuickAddView.tsx     # 快速添加窗口
│   │   ├── hooks/
│   │   │   ├── useWails.ts          # Wails 绑定封装
│   │   │   └── useWailsEvents.ts    # Wails 事件订阅
│   │   └── stores/appStore.ts       # Zustand 全局状态
│   └── bindings/             # Wails v3 自动生成的类型安全绑定
└── build/                    # 构建资源（图标、安装脚本等）
```

## 环境要求

- Go 1.25+
- Node.js 18+
- [Wails CLI v3](https://v3alpha.wails.io/getting-started/installation/)
- [Task](https://taskfile.dev/installation/) (构建工具)

## 快速开始

### 安装 Wails CLI

```bash
go install github.com/wailsapp/wails/v3/cmd/wails3@latest
```

### 安装 Task

```bash
# macOS
brew install go-task

# 其他平台参考 https://taskfile.dev/installation/
```

### 开发模式

```bash
wails3 dev
```

启动后前端支持热重载。

### 构建生产包

```bash
wails3 build
```

生成的可执行文件位于 `build/bin/` 目录。

## 配置

启动应用后，进入 **设置** 页面配置 AI：

- **API Key** — Claude API 密钥
- **Base URL** — API 地址（留空使用默认 Anthropic 地址，支持自定义代理）
- **Model** — 模型名称（默认 `claude-sonnet-4-20250514`）

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `⌘⇧N` | 快速添加任务 |
| `⌘1` | 今日任务 |
| `⌘⇧C` | AI 助手 |
| `⌘Q` | 退出应用 |

## 许可证

MIT
