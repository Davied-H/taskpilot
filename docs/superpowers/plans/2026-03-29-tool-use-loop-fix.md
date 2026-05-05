# Tool Use 循环修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 AI 助手的 Tool Use 循环，使 Claude 能基于工具执行结果生成完整回复，并正确维护对话历史。

**Architecture:** 修改 `claude.go` 的消息类型支持 content block 数组格式（text + tool_use + tool_result），修改 `ai_service.go` 在工具执行后将结果回传 Claude 并获取后续回复。同时让 `list_tasks` 返回实际任务数据。

**Tech Stack:** Go, Claude API (Anthropic Messages API with Tool Use)

---

### Task 1: 扩展 claude.go 消息类型支持 content blocks

**Files:**
- Modify: `internal/ai/claude.go:22-31` (ChatMessage, ToolCall 类型)
- Modify: `internal/ai/claude.go:69-80` (apiContentBlock, apiMessage 类型)

- [ ] **Step 1: 给 ToolCall 添加 ID 字段**

在 `internal/ai/claude.go` 中修改 `ToolCall` 结构体，添加工具调用 ID（Claude API 需要用此 ID 关联 tool_result）：

```go
// ToolCall represents a tool invocation requested by the model.
type ToolCall struct {
	ID    string                 `json:"id"`
	Name  string                 `json:"name"`
	Input map[string]interface{} `json:"input"`
}
```

- [ ] **Step 2: 新增 ContentBlock 类型和修改 ChatMessage**

在 `internal/ai/claude.go` 中，在 `ChatMessage` 下方添加 `ContentBlock` 类型，并修改 `ChatMessage` 支持复杂内容：

```go
// ContentBlock represents a single block in a multi-block message (text, tool_use, or tool_result).
type ContentBlock struct {
	Type      string                 `json:"type"`                // "text", "tool_use", "tool_result"
	Text      string                 `json:"text,omitempty"`      // for type="text"
	ID        string                 `json:"id,omitempty"`        // for type="tool_use"
	Name      string                 `json:"name,omitempty"`      // for type="tool_use"
	Input     map[string]interface{} `json:"input,omitempty"`     // for type="tool_use"
	ToolUseID string                 `json:"tool_use_id,omitempty"` // for type="tool_result"
	Content   string                 `json:"content,omitempty"`   // for type="tool_result"
}

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role          string         `json:"role"`
	Content       string         `json:"content,omitempty"`        // simple text content
	ContentBlocks []ContentBlock `json:"content_blocks,omitempty"` // complex multi-block content
}
```

- [ ] **Step 3: 修改 apiMessage 支持 content block 数组**

将 `apiMessage` 的 `Content` 字段改为 `interface{}`，使其既能接收 string 也能接收 `[]ContentBlock`：

```go
type apiMessage struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"` // string or []ContentBlock
}
```

- [ ] **Step 4: 修改 ChatStream 中的消息构建逻辑**

在 `ChatStream` 方法中（约 line 381-383），将消息转换逻辑改为支持 ContentBlocks：

```go
apiMsgs := make([]apiMessage, len(messages))
for i, m := range messages {
	if len(m.ContentBlocks) > 0 {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.ContentBlocks}
	} else {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.Content}
	}
}
```

- [ ] **Step 5: 修改 parseSSEStream 保存 tool ID**

在 `parseSSEStream` 中（约 line 498），将 `currentToolID` 保存到 ToolCall：

```go
toolCalls = append(toolCalls, ToolCall{
	ID:    currentToolID,
	Name:  currentToolName,
	Input: input,
})
```

- [ ] **Step 6: 同步修改 Chat（非流式）方法中的消息构建和 ToolCall ID**

在 `Chat` 方法中（约 line 300-365），同步修改：

1. 消息构建逻辑（与 Step 4 相同）：
```go
apiMsgs := make([]apiMessage, len(messages))
for i, m := range messages {
	if len(m.ContentBlocks) > 0 {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.ContentBlocks}
	} else {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.Content}
	}
}
```

2. 工具调用解析时保存 ID：
```go
toolCalls = append(toolCalls, ToolCall{
	ID:    block.ID,
	Name:  block.Name,
	Input: input,
})
```

- [ ] **Step 7: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功（可能因 ai_service.go 未更新而有 warning，但不应有 error）

- [ ] **Step 8: Commit**

```bash
git add internal/ai/claude.go
git commit -m "feat: 扩展 ChatMessage 和 ToolCall 支持 content blocks 和 tool ID"
```

---

### Task 2: 实现 StreamChatWithAI 的 Tool Use 循环

**Files:**
- Modify: `services/ai_service.go:50-122` (StreamChatWithAI 方法)

- [ ] **Step 1: 重构 StreamChatWithAI 实现工具结果回传循环**

替换 `services/ai_service.go` 中的 `StreamChatWithAI` 方法（line 50-122）为以下实现：

```go
// StreamChatWithAI starts a streaming chat session and emits Wails events for each chunk.
func (s *AIService) StreamChatWithAI(message string, projectID string) error {
	if s.aiClient == nil {
		return fmt.Errorf("AI 未配置 – 请先在设置中配置 API Key")
	}

	logger.Log.Info("stream chat request", "messageLen", len(message), "projectID", projectID)

	tasks, err := s.Core.TaskStore.ListAll()
	if err != nil {
		tasks = []model.Task{}
	}
	taskJSON, _ := json.Marshal(tasks)

	s.chatHistory = append(s.chatHistory, ai.ChatMessage{
		Role:    "user",
		Content: message,
	})

	// Persist user message
	s.Core.ChatStore.Save(projectID, "user", message, "[]")

	app := application.Get()
	if app == nil {
		return fmt.Errorf("application not available")
	}

	go func() {
		var allToolResults []ToolCallResult
		const maxToolRounds = 5 // 防止无限循环

		for round := 0; round < maxToolRounds; round++ {
			text, toolCalls, err := s.aiClient.ChatStream(s.chatHistory, string(taskJSON), func(evt ai.StreamEvent) {
				switch evt.Type {
				case ai.StreamEventStart:
					app.Event.Emit("ai:stream:start", map[string]string{"messageId": evt.MessageID})
				case ai.StreamEventChunk:
					app.Event.Emit("ai:stream:chunk", map[string]string{"messageId": evt.MessageID, "text": evt.Text})
				case ai.StreamEventToolCall:
					app.Event.Emit("ai:stream:tool_call", map[string]interface{}{"messageId": evt.MessageID, "name": evt.ToolName, "input": evt.ToolInput})
				case ai.StreamEventEnd:
					// Will be emitted after all rounds complete
				case ai.StreamEventError:
					app.Event.Emit("ai:stream:error", map[string]string{"messageId": evt.MessageID, "error": evt.Text})
				}
			})

			if err != nil {
				logger.Log.Error("stream chat failed", "error", err)
				app.Event.Emit("ai:stream:error", map[string]string{"messageId": "", "error": fmt.Sprintf("AI 对话失败: %v", err)})
				return
			}

			// 如果没有工具调用，这是最终回复
			if len(toolCalls) == 0 {
				s.chatHistory = append(s.chatHistory, ai.ChatMessage{Role: "assistant", Content: text})
				break
			}

			// 构建 assistant 消息的 content blocks（text + tool_use blocks）
			var assistantBlocks []ai.ContentBlock
			if text != "" {
				assistantBlocks = append(assistantBlocks, ai.ContentBlock{Type: "text", Text: text})
			}
			for _, tc := range toolCalls {
				assistantBlocks = append(assistantBlocks, ai.ContentBlock{
					Type:  "tool_use",
					ID:    tc.ID,
					Name:  tc.Name,
					Input: tc.Input,
				})
			}
			s.chatHistory = append(s.chatHistory, ai.ChatMessage{
				Role:          "assistant",
				ContentBlocks: assistantBlocks,
			})

			// 执行工具调用并构建 tool_result blocks
			var toolResultBlocks []ai.ContentBlock
			for _, tc := range toolCalls {
				result := s.executeToolCall(tc)
				allToolResults = append(allToolResults, result)
				app.Event.Emit("ai:stream:tool_result", map[string]interface{}{
					"messageId": "", "name": tc.Name, "result": result, "success": result.Success,
				})

				resultJSON, _ := json.Marshal(result)
				toolResultBlocks = append(toolResultBlocks, ai.ContentBlock{
					Type:      "tool_result",
					ToolUseID: tc.ID,
					Content:   string(resultJSON),
				})
			}
			s.chatHistory = append(s.chatHistory, ai.ChatMessage{
				Role:          "user",
				ContentBlocks: toolResultBlocks,
			})

			logger.Log.Info("tool use round completed", "round", round+1, "toolCalls", len(toolCalls))
			// 循环继续：再次调用 ChatStream，Claude 会基于工具结果生成回复
		}

		// 保存最终的 assistant 文本回复
		finalText := ""
		if len(s.chatHistory) > 0 {
			last := s.chatHistory[len(s.chatHistory)-1]
			if last.Role == "assistant" {
				finalText = last.Content
				if finalText == "" {
					// 从 ContentBlocks 中提取文本
					for _, b := range last.ContentBlocks {
						if b.Type == "text" {
							finalText += b.Text
						}
					}
				}
			}
		}

		toolResultsJSON := "[]"
		if len(allToolResults) > 0 {
			b, _ := json.Marshal(allToolResults)
			toolResultsJSON = string(b)
		}
		s.Core.ChatStore.Save(projectID, "assistant", finalText, toolResultsJSON)

		app.Event.Emit("ai:stream:end", map[string]string{"messageId": ""})

		logger.Log.Info("stream chat completed", "textLen", len(finalText), "toolCalls", len(allToolResults))
	}()

	return nil
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add services/ai_service.go
git commit -m "feat: 实现完整的 Tool Use 循环，工具结果回传 Claude 获取后续回复"
```

---

### Task 3: 改进 list_tasks 返回实际任务数据

**Files:**
- Modify: `services/ai_service.go:315-329` (list_tasks case in executeToolCall)

- [ ] **Step 1: 修改 list_tasks 返回任务详情**

在 `services/ai_service.go` 的 `executeToolCall` 方法中，修改 `list_tasks` case，返回实际任务数据而不仅仅是计数：

```go
	case "list_tasks":
		var tasks []model.Task
		var err error
		if pid := getStr("projectId"); pid != "" {
			tasks, err = s.Core.TaskStore.ListByProject(pid)
		} else if status := getStr("status"); status != "" {
			tasks, err = s.Core.TaskStore.ListByStatus(status)
		} else {
			tasks, err = s.Core.TaskStore.ListAll()
		}
		if err != nil {
			result = ToolCallResult{Action: tc.Name, Success: false, Message: err.Error()}
		} else {
			summary := fmt.Sprintf("找到 %d 个任务", len(tasks))
			if len(tasks) > 0 {
				taskData, _ := json.Marshal(tasksToMaps(tasks))
				summary += "\n" + string(taskData)
			}
			result = ToolCallResult{Action: tc.Name, Success: true, Message: summary}
		}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add services/ai_service.go
git commit -m "feat: list_tasks 返回完整任务数据供 Claude 生成详细回复"
```

---

### Task 4: 修复前端空内容消息丢弃问题

**Files:**
- Modify: `frontend/src/hooks/useAIStream.ts:49-65` (ai:stream:end handler)

- [ ] **Step 1: 修改 end 事件处理，当只有 toolResults 没有文本时也保存消息**

在 `frontend/src/hooks/useAIStream.ts` 中，修改 `ai:stream:end` 事件处理逻辑：

```ts
    const unsubEnd = Events.On('ai:stream:end', () => {
      const finalContent = contentRef.current
      const finalToolResults = toolResultsRef.current
      setStatus('idle')
      if (finalContent || finalToolResults.length > 0) {
        addChatMessage({
          role: 'assistant',
          content: finalContent || '',
          toolResults: finalToolResults.length > 0 ? [...finalToolResults] : undefined,
          timestamp: Date.now(),
        })
      }
      setStreamingContent('')
      setToolResults([])
      contentRef.current = ''
      toolResultsRef.current = []
    })
```

关键改动：`if (finalContent)` → `if (finalContent || finalToolResults.length > 0)`，确保即使文本为空但有工具结果时也不丢弃消息。

- [ ] **Step 2: 验证前端编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && cd frontend && npm run build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/useAIStream.ts
git commit -m "fix: 修复空文本但有工具结果时消息被静默丢弃的问题"
```

---

### Task 5: 完整构建验证

**Files:**
- No file changes, verification only

- [ ] **Step 1: 完整构建项目**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功，无错误

- [ ] **Step 2: 前端构建**

Run: `cd /Users/dong/Desktop/Projects/taskpilot/frontend && npm run build`
Expected: 编译成功

- [ ] **Step 3: 检查 Wails 绑定是否需要更新**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && wails3 generate bindings`
Expected: 绑定生成成功（如果 StreamChatWithAI 签名未变则不需要更新）
