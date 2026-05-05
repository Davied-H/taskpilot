# TaskPilot 实时更新机制完全指南

这是对 TaskPilot Wails 应用实时更新机制的深度探索文档，包含完整的数据流、事件机制、多窗口同步原理。

## 📚 文档结构

1. **核心概念** - 3 个关键问题的答案
2. **完整流程链** - 从用户操作到 UI 更新的每一步
3. **事件映射** - 所有事件名称、发射点和处理方式
4. **多窗口同步** - 独立 React 运行时如何协调
5. **时序图表** - AI 修改任务的完整时间线
6. **文件速查** - 每个关键文件的作用

## 🎯 核心答案

### 问题 1：任务是如何从后端创建/更新到前端显示的？

**完整流程**（以 AI 创建任务为例）：

```
用户输入消息 → streamChatWithAI() → AIService.StreamChatWithAI() [async]
    ↓
ClaudeClient.ChatStream() [SSE 流式]
    ├─ 逐字发送文本 → Emit("ai:stream:chunk")
    ├─ 接收工具调用 → Emit("ai:stream:tool_call")
    └─ 返回 (text, toolCalls)
    ↓
for each toolCall in toolCalls:
    executeToolCall(tc)
    ├─ case "create_task":
    │      TaskStore.Create() ← ⭐ 数据库修改
    │      Emit("task:changed") ← 通知所有窗口
    │      Emit("ai:stream:tool_result") ← 工具结果
    ↓
前端事件监听
    ├─ Events.On('ai:stream:chunk') → contentRef += text → setStreamingContent()
    ├─ Events.On('ai:stream:tool_result') → toolResults.push() → setToolResults()
    └─ Events.On('task:changed') → getAllTasks() → setTasks()
    ↓
React 重新渲染
    └─ TaskList / TodayView 显示新任务
```

### 问题 2：Wails 事件如何从 Go 到 React？

- **Go 侧**: `app.Event.Emit("task:changed", nil)`
- **React 侧**: `Events.On('task:changed', callback)`
- **Wails 运行时**: 自动建立 IPC 桥接

### 问题 3：任务列表何时更新？

- **初始化**: App.tsx 的 useEffect 中调用 getAllTasks()
- **实时**: useWailsEvents 监听 'task:changed' 事件并重新查询
- **触发**: 任何任务 CRUD 操作或自动标签完成

## 🔑 关键文件映射

### Go 后端

| 文件 | 行数 | 关键函数 | 事件发射点 |
|------|------|--------|---------|
| `services/task_service.go` | 151 | CreateTask/UpdateTask/DeleteTask/emitChange | 41, 61, 71 |
| `services/ai_service.go` | 461 | StreamChatWithAI/executeToolCall | 77-119, 234-327 |
| `internal/ai/claude.go` | 784 | ChatStream/parseSSEStream | 368-423, 425-510+ |
| `internal/store/task_store.go` | 137 | Create/Update/Delete | 19-49 |

### React 前端

| 文件 | 关键函数 | 作用 |
|------|--------|------|
| `hooks/useWailsEvents.ts` | - | 监听 task:changed / project:changed / task:tags:updated |
| `hooks/useAIStream.ts` | - | 监听 ai:stream:* 事件 |
| `stores/appStore.ts` | setTasks / setProjects | Zustand 状态管理 |
| `components/TaskList.tsx` | - | 消费 tasks，显示任务列表 |
| `components/TaskForm.tsx` | handleSave | 创建/更新任务的 UI |
| `components/ChatPanel.tsx` | handleSend | 发送消息给 AI |

## 📡 所有事件名称

### 任务事件
- `task:changed` - 任务创建、更新、删除完成
- `task:tags:updated` - 自动标签更新完成

### 项目事件
- `project:changed` - 项目创建、更新、删除完成

### AI 流式事件
- `ai:stream:start` - 开始接收流式响应
- `ai:stream:chunk` - 收到文本块（重复多次）
- `ai:stream:tool_call` - 开始工具调用
- `ai:stream:tool_result` - 工具执行结果（重复多次）
- `ai:stream:error` - 发生错误
- `ai:stream:end` - 流式处理结束

## ⏱️ 时序关键点

| 时刻 | 发生的事 | 位置 |
|------|--------|------|
| t=0 | 用户输入消息 | ChatPanel |
| t=1 | streamChatWithAI() 被调用 | useAIStream |
| t=2 | 启动异步 goroutine | AIService |
| t=3 | SSE 文本块逐个到达 | ClaudeClient.parseSSEStream |
| **t=4** | **⭐ 数据库被修改** | TaskStore.Create/Update/Delete |
| **t=5** | **Emit("task:changed")** | executeToolCall 之后 |
| t=6 | Emit("ai:stream:tool_result") | StreamChatWithAI |
| t=7 | Events.On('task:changed') 触发 | useWailsEvents |
| t=8 | getAllTasks() 重新查询 | useWailsEvents |
| t=9 | setTasks() 更新 Zustand store | useWailsEvents |
| t=10 | React 组件重新渲染 | React reconciliation |

**关键事实**: 当前端收到 'task:changed' 事件时，数据库已经完全更新，getAllTasks() 会获得最新数据。

## 🪟 多窗口同步

### 独立运行时
- 主窗口、AI 助手窗口、快速添加窗口各有独立的 React/JS 运行时
- 各窗口各有独立的 Zustand store 实例
- 无法通过 localStorage 或全局变量直接通信

### Wails 事件总线
```
任意窗口修改任务 
    ↓
TaskService.UpdateTask()
    ├─ TaskStore.Update() [SQLite 修改]
    └─ app.Event.Emit("task:changed")
       ↓ Wails 广播给所有窗口
    ┌──────────────────────────────┐
    ├─> 主窗口: Events.On() → getAllTasks() → setTasks() → 重新渲染
    ├─> AI 窗口: Events.On() → getAllTasks() → setTasks() → 重新渲染
    └─> 快速添加: Events.On() → getAllTasks() → setTasks()
    └──────────────────────────────┘
```

## 🤖 AI 工具列表

Claude 可用的 4 个工具（在 `/internal/ai/claude.go` 中定义）：

1. **create_task** - 创建新任务
   ```
   参数: title(必需), projectId(必需), priority(0-3), dueDate(YYYY-MM-DD)
   效果: TaskStore.Create() → Emit("task:changed")
   ```

2. **update_task** - 更新任务
   ```
   参数: id(必需), title, status(todo|doing|done), priority, dueDate
   效果: TaskStore.Update() → Emit("task:changed")
   ```

3. **delete_task** - 删除任务
   ```
   参数: id(必需)
   效果: TaskStore.Delete() → Emit("task:changed")
   ```

4. **list_tasks** - 查询任务（仅读）
   ```
   参数: projectId(可选), status(可选)
   效果: TaskStore.List*() [无事件发射]
   ```

## 📊 数据流向图

```
useWailsEvents() 核心代码：
─────────────────────────────
export function useWailsEvents() {
  const { setProjects, setTasks } = useAppStore()
  
  useEffect(() => {
    // 监听任务变化
    const unsubTask = Events.On('task:changed', async () => {
      const tasks = await getAllTasks()  // 重新查询数据库
      setTasks(tasks || [])  // 更新 Zustand store
    })
    
    // 监听标签更新
    const unsubTags = Events.On('task:tags:updated', async () => {
      const tasks = await getAllTasks()
      setTasks(tasks || [])
    })
    
    return () => {
      if (unsubTask) unsubTask()
      if (unsubTags) unsubTags()
    }
  }, [setProjects, setTasks])
}

当 setTasks() 被调用时：
  ↓
Zustand 通知所有订阅者
  ↓
TaskList.tsx 和 TodayView.tsx 重新渲染
  ↓
UI 显示最新任务列表
```

## 🔍 调试方法

### 查看 Go 日志
```bash
tail -f data/logs/debug.log | grep "task:changed\|executeToolCall\|tool call result"
```

### 监听前端事件（Console）
```typescript
Events.On('task:changed', () => console.log('task:changed fired'))
Events.On('ai:stream:chunk', (e) => console.log('Chunk:', e.data?.[0]?.text))
Events.On('ai:stream:tool_result', (e) => console.log('Tool:', e.data?.[0]))
```

### 数据库验证
```sql
sqlite3 data/tasks.db
SELECT * FROM tasks WHERE title LIKE '%关键词%' ORDER BY created_at DESC LIMIT 5;
```

### 多窗口测试
1. 打开主窗口和 AI 助手窗口
2. 在主窗口创建任务
3. 检查 AI 助手窗口是否立即显示新任务
4. 用 AI 修改任务，检查主窗口是否实时更新

## ⚡ 性能特性

- **事件驱动** - 无轮询，实时性毫秒级
- **异步处理** - AI 流式处理不阻塞 UI
- **自动标签** - 后台异步执行，完成后通知
- **查询优化** - task:changed 时仅执行一次 getAllTasks()
- **多窗口效率** - 每个窗口独立处理，无竞争

## ✅ 验证清单

- [ ] 创建任务后立即在 TaskList 看到
- [ ] AI 说"创建任务"后流式显示文本
- [ ] AI 工具结果显示在 ChatPanel
- [ ] 切换到 AI 助手窗口，看到新任务
- [ ] 修改任务状态，所有窗口同时更新
- [ ] 日志显示 "task:changed" 发射
- [ ] 多窗口修改同一任务，无冲突
- [ ] 自动标签完成后任务包含标签

## 📝 常见问题

**Q: 为什么不直接在 ChatPanel 更新 tasks？**
A: 因为需要支持多窗口同步。通过 Wails 事件广播，所有窗口都能看到最新数据。

**Q: getAllTasks() 是否太频繁？**
A: 不是。仅在 task:changed 事件时调用，而不是轮询。性能很好。

**Q: 自动标签会导致双重事件吗？**
A: 会。autoTag() 完成后发射 task:tags:updated，此时再发射 task:changed。前端会调用 getAllTasks() 两次，但很快。

**Q: 工具执行时前端正在显示流式文本，会不会冲突？**
A: 不会。工具执行完成前，useAIStream 已缓冲工具结果，SSE 流式结束后才作为完整消息加入 chatMessages。

**Q: 如果 SQLite 同时收到多个写入会怎样？**
A: SQLite 内部处理并发，后面的操作会等待。所有窗口最终都通过 task:changed 事件同步到一致状态。

## 🏗️ 架构优势总结

1. **完全事件驱动** - 不依赖轮询或定时器
2. **无状态同步** - 每个窗口独立查询，不需要跨窗口状态共享
3. **声明式 UI** - React 组件只需声明依赖，自动响应数据变化
4. **实时流式体验** - AI 响应和工具结果逐步显示
5. **高内聚低耦合** - 前后端通过明确的事件接口解耦

---

## 📖 相关源代码文件

```
Go 后端:
├── services/
│   ├── task_service.go          (CRUD + autoTag)
│   ├── ai_service.go            (StreamChatWithAI + executeToolCall)
│   ├── project_service.go       (项目 CRUD)
│   └── config_service.go
├── internal/
│   ├── ai/
│   │   └── claude.go            (Claude API + SSE)
│   ├── core/
│   │   └── core.go              (AppCore 初始化)
│   ├── store/
│   │   ├── task_store.go        (任务数据库)
│   │   ├── project_store.go     (项目数据库)
│   │   ├── chat_store.go        (聊天持久化)
│   │   └── db.go                (数据库连接)
│   └── logger/
│       └── logger.go
└── main.go

React 前端:
├── src/
│   ├── hooks/
│   │   ├── useWailsEvents.ts    (事件监听)
│   │   ├── useAIStream.ts       (AI 流式处理)
│   │   ├── useWails.ts          (Go Bindings)
│   │   └── useShortcuts.ts
│   ├── stores/
│   │   ├── appStore.ts          (Zustand)
│   │   └── shortcutStore.ts
│   ├── components/
│   │   ├── TaskList.tsx         (任务列表)
│   │   ├── TodayView.tsx        (今日视图)
│   │   ├── ChatPanel.tsx        (对话界面)
│   │   ├── TaskForm.tsx         (表单)
│   │   └── ...
│   └── App.tsx
└── index.html
```

---

**最后更新**: 2026-03-29
**涵盖版本**: TaskPilot with Wails v3
**文档作者**: 深度代码探索
