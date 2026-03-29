# TaskPilot

一款集成 AI 能力的桌面端任务管理应用，基于 [Wails](https://wails.io) 构建，前端使用 React + TypeScript，后端使用 Go。

## 功能特性

- **项目管理** — 创建、编辑、删除项目，按项目组织任务
- **任务管理** — 支持任务的增删改查，设置优先级与截止日期
- **今日视图** — 聚焦当天待办与进行中的任务
- **AI 对话助手** — 通过侧边栏与 Claude AI 对话，自然语言管理任务
- **每日总结** — AI 自动生成今日任务摘要
- **智能建议** — AI 根据现有任务推荐新任务
- **任务拆解** — AI 将复杂任务分解为可执行的子任务
- **优先级分析** — AI 分析并建议任务优先级调整
- **周报生成** — AI 自动生成每周工作进度报告

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | [Wails v2](https://wails.io) |
| 后端 | Go 1.23+, SQLite |
| 前端 | React 18, TypeScript, Vite |
| UI | Tailwind CSS v4, Framer Motion |
| 状态管理 | Zustand |
| AI | Claude API (可配置 Base URL 和模型) |
| 数据存储 | SQLite (`~/.taskpilot/data.db`) |

## 项目结构

```
taskpilot/
├── main.go                  # 应用入口
├── app.go                   # 后端核心逻辑（项目/任务/AI 接口）
├── wails.json               # Wails 配置
├── internal/
│   ├── ai/claude.go         # Claude API 客户端
│   ├── model/               # 数据模型（Project, Task）
│   └── store/               # 数据层（SQLite 存储）
├── frontend/
│   ├── src/
│   │   ├── App.tsx           # 主应用组件
│   │   ├── components/       # UI 组件
│   │   │   ├── Sidebar.tsx       # 侧边栏导航
│   │   │   ├── TodayView.tsx     # 今日视图
│   │   │   ├── TaskList.tsx      # 任务列表
│   │   │   ├── TaskItem.tsx      # 任务卡片
│   │   │   ├── TaskForm.tsx      # 任务表单
│   │   │   ├── ProjectForm.tsx   # 项目表单
│   │   │   ├── ChatPanel.tsx     # AI 对话面板
│   │   │   ├── DailySummary.tsx  # 每日总结
│   │   │   └── SettingsView.tsx  # 设置页面
│   │   ├── hooks/useWails.ts     # Wails 绑定封装
│   │   └── stores/appStore.ts    # Zustand 全局状态
│   └── wailsjs/              # Wails 自动生成的 JS 绑定
└── build/                    # 构建资源（图标、安装脚本等）
```

## 环境要求

- Go 1.23+
- Node.js 18+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation)

## 快速开始

### 安装 Wails CLI

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@latest
```

### 开发模式

```bash
wails dev
```

启动后前端支持热重载。也可通过浏览器访问 `http://localhost:34115` 进行开发调试。

### 构建生产包

```bash
wails build
```

生成的可执行文件位于 `build/bin/` 目录。

## 配置

启动应用后，进入 **设置** 页面配置 AI：

- **API Key** — Claude API 密钥
- **Base URL** — API 地址（留空使用默认 Anthropic 地址，支持自定义代理）
- **Model** — 模型名称（默认 `claude-sonnet-4-20250514`）

## 许可证

MIT
