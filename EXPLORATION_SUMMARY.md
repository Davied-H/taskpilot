# TaskPilot 实时更新机制 - 深度探索总结

## 📋 探索范围

本次深度探索覆盖了 TaskPilot Wails 应用的完整实时更新机制，包括：

1. ✅ Go 后端任务 CRUD 操作流程
2. ✅ Wails 事件发射和监听机制
3. ✅ React 前端状态管理和组件更新
4. ✅ Claude AI 流式处理和工具调用
5. ✅ 多窗口跨运行时同步原理
6. ✅ SSE 流式处理实现细节
7. ✅ 自动标签后台异步更新

## 🎯 发现的关键事实

### 事件驱动架构
- **核心事件**: `task:changed` 是任务数据变化的唯一通知源
- **广播机制**: Wails 运行时自动广播事件到所有窗口
- **无轮询设计**: 完全依赖事件，无任何轮询或定时刷新

### 多窗口同步原理
- 三个窗口（主窗口、AI 助手、快速添加）各有独立的 React 运行时
- 各窗口各有独立的 Zustand store 实例
- 通过 Wails 事件总线实现数据同步，不依赖共享内存
- 每个窗口都监听 `task:changed` 并独立调用 `getAllTasks()` 查询数据库

### AI 操作的完整流程
```
用户消息
  ↓
streamChatWithAI(message, projectId)  [同步返回]
  ↓
AIService.StreamChatWithAI()  [异步 goroutine]
  ├─ ClaudeClient.ChatStream()  [SSE 流式]
  │  ├─ onEvent(start) → Emit("ai:stream:start")
  │  ├─ onEvent(chunk) → Emit("ai:stream:chunk")  [逐字]
  │  ├─ onEvent(tool_call) → Emit("ai:stream:tool_call")
  │  └─ 返回 (text, toolCalls, nil)
  │
  ├─ for tc in toolCalls:
  │    executeToolCall(tc)
  │    ├─ TaskStore.Create/Update/Delete()  [数据库修改]
  │    ├─ Emit("task:changed")  [通知前端]
  │    └─ Emit("ai:stream:tool_result")  [工具结果]
  │
  ├─ ChatStore.Save(assistant message)  [持久化]
  └─ Emit("ai:stream:end")  [流式结束]
```

### 前端事件处理的并行性
- `useWailsEvents` 监听 `task:changed`、`project:changed`、`task:tags:updated`
- `useAIStream` 监听 `ai:stream:start`、`ai:stream:chunk`、`ai:stream:tool_result` 等
- 两个 hooks 的事件监听完全独立，互不干扰
- 前端可同时处理流式 UI 更新和数据库同步

## 🔍 关键代码行号速查

### Go 后端事件发射点
| 事件名 | 文件 | 行号 | 函数 |
|--------|------|------|------|
| task:changed | task_service.go | 41, 61, 71 | emitChange() 调用点 |
| task:tags:updated | task_service.go | 144 | autoTag() 完成后 |
| ai:stream:start | claude.go | 462 | parseSSEStream() |
| ai:stream:chunk | claude.go | 486 | parseSSEStream() |
| ai:stream:tool_call | claude.go | SSE 处理中 | parseSSEStream() |
| ai:stream:tool_result | ai_service.go | 104 | executeToolCall() 之后 |
| ai:stream:end | ai_service.go | 116 | StreamChatWithAI() 结尾 |

### React 前端事件监听点
| 事件名 | 文件 | 作用 |
|--------|------|------|
| task:changed | useWailsEvents.ts:20 | 重新查询任务 |
| task:tags:updated | useWailsEvents.ts:25 | 重新查询任务 |
| ai:stream:* | useAIStream.ts:16-89 | 流式 UI 更新 |

## 📊 数据流分析

### 场景：AI 创建任务 "明天下午完成设计稿"

**前端 (React)**
```typescript
// t=0: ChatPanel.handleSend()
const message = "明天下午完成设计稿"
addChatMessage({role: 'user', content: message})
setStatus('streaming')
await streamChatWithAI(message, projectId)
```

**Go 侧 (异步)**
```go
// t=1: AIService.StreamChatWithAI()
go func() {
  text, toolCalls, _ := s.aiClient.ChatStream(...)
  // 返回: text="我已创建任务...", toolCalls=[{Name:"create_task", Input:{title:"完成设计稿",...}}]
  
  // t=4: 数据库修改
  for _, tc := range toolCalls {
    result := s.executeToolCall(tc)  // TaskStore.Create()
    app.Event.Emit("task:changed", nil)  // 通知所有窗口
    app.Event.Emit("ai:stream:tool_result", result)
  }
}()

// 返回给前端的是 nil error（因为是异步）
```

**前端 (再次)**
```typescript
// t=3-7: 流式事件到达
Events.On('ai:stream:chunk', (e) => {
  contentRef.current += e.data.text
  setStreamingContent(contentRef.current)  // UI 逐字更新
})

// t=5: 工具结果到达
Events.On('ai:stream:tool_result', (e) => {
  toolResults.push(e.data.result)
  setToolResults([...toolResults])  // 显示工具执行结果
})

// t=4 or later: 数据库更新事件到达
Events.On('task:changed', async () => {
  const tasks = await getAllTasks()  // 查询最新数据
  setTasks(tasks)  // 更新 store，触发 TaskList 重新渲染
})

// t=7: 流式结束
Events.On('ai:stream:end', () => {
  addChatMessage({
    role: 'assistant',
    content: streamingContent,
    toolResults: toolResults
  })
  setStatus('idle')
})
```

## 🔐 数据完整性保证

### 为什么不会数据不一致？

1. **数据库修改在前**
   - executeToolCall() 中 TaskStore.Create() 首先执行
   - 然后 Emit("task:changed") 通知前端

2. **查询在后**
   - Events.On('task:changed') 回调中调用 getAllTasks()
   - SQLite 已经提交了修改，查询会看到最新数据

3. **多窗口同步**
   - 同一个 event 被广播给所有窗口
   - 每个窗口都独立查询，不依赖其他窗口的状态
   - 最终所有窗口达到一致状态

## ⚙️ 自动标签系统的工作原理

```go
// task_service.go
func (s *TaskService) CreateTask(...) (*model.Task, error) {
  // 1. 同步：创建任务
  s.Core.TaskStore.Create(t)
  s.emitChange()  // 发射 task:changed
  
  // 2. 异步：自动标签
  go s.autoTag(result.ID, result.Title, ...)
  return result
}

func (s *TaskService) autoTag(...) {
  // 获取项目所有任务的现有标签
  tags := s.AutoTagFunc(title, description, existingTags)
  
  // 更新任务的标签字段
  s.Core.TaskStore.Update(*task)  // 修改 tags 字段
  
  // 发射两个事件
  app.Event.Emit("task:tags:updated", ...)  // 特定事件
  app.Event.Emit("task:changed", nil)  // 通用事件
}
```

**前端行为**：
- 收到 `task:tags:updated` → getAllTasks() 
- 收到 `task:changed` → getAllTasks()
- 可能调用两次，但幂等操作，问题不大

## 🎬 关键时刻的执行顺序

```
Timeline of Task Creation via AI:

前端时间轴:                      后端时间轴:
────────────────────────────    ──────────────────────────
t=0: handleSend()               
  ├─ addChatMessage(user)
  ├─ setStatus('streaming')
  └─ streamChatWithAI() ─────────> AIService.StreamChatWithAI()
                                   ├─ ListAll() [获上下文]
                                   ├─ 启动 goroutine:
                                   │   
t=1-10: 处理流式事件          │   ClaudeClient.ChatStream()
  ├─ Emit(start) <──────────────────── SSE start
  │
  ├─ Emit(chunk) <──────────────────── SSE chunk (重复)
  │  ├─ contentRef += text
  │  └─ setStreamingContent()
  │
  ├─ Emit(tool_call) <───────────────── SSE tool_use
  │  └─ setStatus('tool_calling')
  │
  ├─ Emit(tool_result) <────────────────── executeToolCall():
  │  ├─ TaskStore.Create() ← ⭐ DB写入
  │  ├─ Emit("task:changed")
  │  └─ Emit("ai:stream:tool_result")
  │
  ├─ Emit(task:changed) <───────────────── [来自 executeToolCall]
  │  ├─ getAllTasks()
  │  └─ setTasks()
  │
  └─ Emit(end) <────────────────────────── 流式结束
     └─ addChatMessage(assistant+results)

UI最终状态:
  • ChatPanel 显示流式文本 + 工具结果
  • TaskList 显示新任务（来自 setTasks）
  • 数据库已持久化
  • 所有窗口同步更新
```

## 🏆 架构设计的精妙之处

### 1. 异步不阻塞
- streamChatWithAI() 立即返回
- AI 处理在后台 goroutine 中进行
- 前端无需等待，用户可继续操作

### 2. 渐进式更新
- SSE 流式文本逐字到达，UI 立即显示
- 工具执行结果独立事件，立即显示
- 数据库同步通过 task:changed 事件通知
- 用户看到完整的进度反馈

### 3. 无冲突的多窗口
- 不共享 JavaScript 运行时或状态
- 不使用 localStorage（每个窗口都有独立副本）
- 完全通过数据库和事件总线协调
- 最终一致性保证

### 4. 声明式的 React 更新
- 组件只关心 store 中的 tasks 变化
- 无需手动处理事件的复杂逻辑
- Zustand 自动通知订阅者

## 📈 性能特性

| 特性 | 值 | 说明 |
|------|-----|------|
| 事件延迟 | 毫秒级 | Wails IPC 非常快 |
| 查询频率 | 仅 task:changed 时 | 不轮询 |
| 并发查询 | 多窗口可并发 | SQLite 串行化 |
| 流式体验 | SSE 流式 | 无需等待完整响应 |
| 自动标签 | 后台异步 | 不阻塞 UI |

## 🐛 调试技巧

### 追踪任务创建过程
```bash
# 1. 启动应用并监听日志
tail -f data/logs/debug.log | grep "creating task\|tool call"

# 2. 在 Browser Console 中监听事件
Events.On('task:changed', () => {
  console.log('[task:changed]', new Date().toISOString())
})

Events.On('ai:stream:chunk', (e) => {
  console.log('[chunk]', e.data?.[0]?.text)
})

# 3. 验证多窗口同步
# - 打开主窗口和 AI 助手窗口
# - 在 AI 助手中创建任务
# - 查看主窗口是否立即显示
```

### 检查数据一致性
```sql
-- 查看最后创建的任务
sqlite3 data/tasks.db \
  "SELECT id, title, status, created_at FROM tasks ORDER BY created_at DESC LIMIT 5;"

-- 检查标签是否更新
SELECT id, title, tags FROM tasks WHERE tags != '' LIMIT 3;
```

## 📝 文档对应关系

| 探索主题 | 对应文件 | 关键部分 |
|--------|--------|--------|
| 完整流程链 | REALTIME_UPDATE_GUIDE.md | 核心答案部分 |
| 事件列表 | REALTIME_UPDATE_GUIDE.md | 📡 所有事件名称 |
| 时序分析 | REALTIME_UPDATE_GUIDE.md | ⏱️ 时序关键点 |
| 架构图 | （临时文件） | 多窗口同步机制 |
| 代码速查 | 本文档 | 关键代码行号 |

## ✨ 结论

TaskPilot 的实时更新机制是一个精心设计的事件驱动架构：

1. **后端**产生数据变化事件 → **Wails 运行时**广播事件 → **前端**监听事件并重新查询
2. 没有轮询，没有手动订阅管理，没有跨窗口状态共享
3. 通过 Wails 事件总线实现自然的多窗口同步
4. React + Zustand 的声明式 UI 完美配合事件驱动设计
5. AI 流式处理和工具执行的异步设计提供了最佳用户体验

这个架构在保持简洁性的同时，实现了高效、可靠的实时更新和多窗口同步。

---

**探索日期**: 2026-03-29
**探索深度**: 完整的代码追踪和数据流分析
**涵盖文件**: 15+ Go 文件, 10+ React 文件
**发现事件数**: 9 种事件类型
**生成文档**: 4 份详细文档
