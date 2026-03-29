# AI 助手增强实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 TaskPilot AI 助手添加真实流式输出、Streamdown Markdown 渲染、对话持久化、自然语言创建任务、AI 主动建议、智能自动标签。

**Architecture:** Go 后端通过 Claude Streaming API (SSE) 接收 token，经 Wails v3 Events 推送至前端 React hook，由 Streamdown 组件渲染 Markdown 并显示打字机效果。对话持久化到 SQLite，标签通过异步 AI 调用自动生成。

**Tech Stack:** Go 1.25, Wails v3, React 18, TypeScript 5, Zustand, Streamdown, Tailwind CSS v4, SQLite

---

## File Structure

### New Files
- `internal/store/chat_store.go` — 对话消息持久化存储
- `frontend/src/hooks/useAIStream.ts` — 流式消息事件 hook
- `frontend/src/components/MarkdownRenderer.tsx` — Streamdown 封装组件
- `frontend/src/components/ProactiveSuggestions.tsx` — AI 主动建议卡片组件

### Modified Files
- `internal/ai/claude.go` — 新增 ChatStream、GetProactiveSuggestions、AutoTagTask
- `internal/model/task.go` — Task 结构体新增 Tags 字段
- `internal/store/db.go` — 新增 chat_messages 表和 tags 列迁移
- `internal/store/task_store.go` — 所有 SQL 查询增加 tags 列
- `internal/core/core.go` — 初始化 ChatStore
- `services/ai_service.go` — 新增 StreamChatWithAI、持久化、主动建议 RPC
- `services/task_service.go` — 创建/更新任务时触发异步自动标签
- `main.go` — AIService 注入 app 引用（用于 emit events）
- `frontend/package.json` — 新增 streamdown 依赖
- `frontend/src/stores/appStore.ts` — 对话持久化加载、标签筛选、建议缓存
- `frontend/src/hooks/useWails.ts` — 新增 RPC 绑定
- `frontend/src/hooks/useWailsEvents.ts` — 监听标签更新事件
- `frontend/src/components/ChatPanel.tsx` — 流式渲染、MarkdownRenderer、建议卡片
- `frontend/src/components/DailySummary.tsx` — 替换为 MarkdownRenderer
- `frontend/src/components/TaskItem.tsx` — 展示标签
- `frontend/src/components/TaskForm.tsx` — 标签编辑

---

### Task 1: 数据库迁移 — Tags 列 + Chat Messages 表

**Files:**
- Modify: `internal/model/task.go`
- Modify: `internal/store/db.go`

- [ ] **Step 1: Task 模型新增 Tags 字段**

在 `internal/model/task.go` 的 `Task` 结构体末尾（`UpdatedAt` 之后）添加：

```go
Tags      string `json:"tags"`      // 逗号分隔标签
```

- [ ] **Step 2: 数据库迁移新增 tags 列和 chat_messages 表**

在 `internal/store/db.go` 的 `migrate()` 方法中，在现有 `CREATE TABLE` 语句之后追加：

```go
-- 为 tasks 表添加 tags 列（幂等）
ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT '';

-- 对话消息表
CREATE TABLE IF NOT EXISTS chat_messages (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL DEFAULT '',
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    tool_results TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
```

注意：`ALTER TABLE ADD COLUMN` 在 SQLite 中如果列已存在会报错。需要用容错方式处理。完整的 `migrate()` 方法替换为：

```go
func (db *DB) migrate() error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS projects (
			id          TEXT PRIMARY KEY,
			name        TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			color       TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS tasks (
			id          TEXT PRIMARY KEY,
			project_id  TEXT NOT NULL DEFAULT '',
			title       TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			status      TEXT NOT NULL DEFAULT 'todo',
			priority    INTEGER NOT NULL DEFAULT 2,
			due_date    TEXT NOT NULL DEFAULT '',
			tags        TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL,
			updated_at  TEXT NOT NULL
		);

		CREATE TABLE IF NOT EXISTS config (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL DEFAULT ''
		);

		CREATE TABLE IF NOT EXISTS chat_messages (
			id          TEXT PRIMARY KEY,
			project_id  TEXT NOT NULL DEFAULT '',
			role        TEXT NOT NULL,
			content     TEXT NOT NULL,
			tool_results TEXT NOT NULL DEFAULT '',
			created_at  TEXT NOT NULL
		);

		CREATE INDEX IF NOT EXISTS idx_chat_messages_project ON chat_messages(project_id);
		CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
	`)
	if err != nil {
		return err
	}

	// 为已有的 tasks 表添加 tags 列（忽略"列已存在"错误）
	db.Exec(`ALTER TABLE tasks ADD COLUMN tags TEXT NOT NULL DEFAULT ''`)

	return nil
}
```

- [ ] **Step 3: 更新 TaskStore 所有 SQL 查询以包含 tags 列**

在 `internal/store/task_store.go` 中：

**`Create` 方法** — INSERT 语句添加 tags：
```go
_, err := s.db.Exec(
    `INSERT INTO tasks (id, project_id, title, description, status, priority, due_date, tags, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    t.ID, t.ProjectID, t.Title, t.Description, t.Status, t.Priority, t.DueDate, t.Tags, t.CreatedAt, t.UpdatedAt,
)
```

**`Update` 方法** — UPDATE 语句添加 tags：
```go
_, err := s.db.Exec(
    `UPDATE tasks SET project_id=?, title=?, description=?, status=?, priority=?, due_date=?, tags=?, updated_at=? WHERE id=?`,
    t.ProjectID, t.Title, t.Description, t.Status, t.Priority, t.DueDate, t.Tags, t.UpdatedAt, t.ID,
)
```

**`scanTask` 函数** — 添加 tags 扫描：
```go
func scanTask(s scanner) (*model.Task, error) {
	var t model.Task
	err := s.Scan(&t.ID, &t.ProjectID, &t.Title, &t.Description, &t.Status, &t.Priority, &t.DueDate, &t.Tags, &t.CreatedAt, &t.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
```

**所有 SELECT 查询** — 在 `due_date` 和 `created_at` 之间添加 `tags`。影响方法：`GetByID`、`ListByProject`、`ListByStatus`、`ListTodayTasks`、`ListAll`。

SELECT 列表统一改为：
```sql
SELECT id, project_id, title, description, status, priority, due_date, tags, created_at, updated_at FROM tasks
```

- [ ] **Step 4: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功，无错误

- [ ] **Step 5: Commit**

```bash
git add internal/model/task.go internal/store/db.go internal/store/task_store.go
git commit -m "feat: 数据库迁移 — tasks 新增 tags 列，新增 chat_messages 表"
```

---

### Task 2: ChatStore — 对话消息持久化

**Files:**
- Create: `internal/store/chat_store.go`
- Modify: `internal/core/core.go`

- [ ] **Step 1: 创建 ChatStore**

创建 `internal/store/chat_store.go`：

```go
package store

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ChatMsg represents a persisted chat message.
type ChatMsg struct {
	ID          string `json:"id"`
	ProjectID   string `json:"projectId"`
	Role        string `json:"role"`
	Content     string `json:"content"`
	ToolResults string `json:"toolResults"` // JSON array string
	CreatedAt   string `json:"createdAt"`
}

type ChatStore struct {
	db *DB
}

func NewChatStore(db *DB) *ChatStore {
	return &ChatStore{db: db}
}

func (s *ChatStore) Save(projectID, role, content, toolResults string) error {
	id := uuid.NewString()
	now := time.Now().Format(time.RFC3339)
	if toolResults == "" {
		toolResults = "[]"
	}
	_, err := s.db.Exec(
		`INSERT INTO chat_messages (id, project_id, role, content, tool_results, created_at)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		id, projectID, role, content, toolResults, now,
	)
	return err
}

func (s *ChatStore) GetMessages(projectID string, limit, offset int) ([]ChatMsg, error) {
	rows, err := s.db.Query(
		`SELECT id, project_id, role, content, tool_results, created_at
		 FROM chat_messages
		 WHERE project_id = ?
		 ORDER BY created_at DESC
		 LIMIT ? OFFSET ?`,
		projectID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var msgs []ChatMsg
	for rows.Next() {
		var m ChatMsg
		if err := rows.Scan(&m.ID, &m.ProjectID, &m.Role, &m.Content, &m.ToolResults, &m.CreatedAt); err != nil {
			return nil, err
		}
		msgs = append(msgs, m)
	}
	// Reverse to chronological order (query is DESC for LIMIT/OFFSET)
	for i, j := 0, len(msgs)-1; i < j; i, j = i+1, j-1 {
		msgs[i], msgs[j] = msgs[j], msgs[i]
	}
	return msgs, rows.Err()
}

func (s *ChatStore) DeleteByProject(projectID string) error {
	_, err := s.db.Exec(`DELETE FROM chat_messages WHERE project_id = ?`, projectID)
	return err
}

func (s *ChatStore) DeleteAll() error {
	_, err := s.db.Exec(`DELETE FROM chat_messages`)
	return err
}

// SaveToolResultsJSON marshals tool results to JSON string for storage.
func SaveToolResultsJSON(results interface{}) string {
	if results == nil {
		return "[]"
	}
	b, err := json.Marshal(results)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// scanner interface is already defined in task_store.go via the same package.
// No need to redeclare.
var _ sql.Scanner = (*sql.NullString)(nil) // compile check only
```

- [ ] **Step 2: 将 ChatStore 添加到 AppCore**

在 `internal/core/core.go` 中：

将 `AppCore` 结构体修改为：

```go
type AppCore struct {
	DB           *store.DB
	ProjectStore *store.ProjectStore
	TaskStore    *store.TaskStore
	ConfigStore  *store.ConfigStore
	ChatStore    *store.ChatStore
	DataDir      string
}
```

在 `NewAppCore()` 的 return 中添加：

```go
return &AppCore{
    DB:           db,
    ProjectStore: store.NewProjectStore(db),
    TaskStore:    store.NewTaskStore(db),
    ConfigStore:  store.NewConfigStore(db),
    ChatStore:    store.NewChatStore(db),
    DataDir:      dataDir,
}, nil
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add internal/store/chat_store.go internal/core/core.go
git commit -m "feat: 新增 ChatStore 对话消息持久化"
```

---

### Task 3: Claude Streaming API — Go 后端

**Files:**
- Modify: `internal/ai/claude.go`

- [ ] **Step 1: 添加 streaming 相关类型定义**

在 `internal/ai/claude.go` 中，在 `apiResponse` 类型定义之后添加：

```go
// ---------- streaming types ----------

// StreamEventType identifies the kind of stream event.
type StreamEventType string

const (
	StreamEventStart      StreamEventType = "start"
	StreamEventChunk      StreamEventType = "chunk"
	StreamEventToolCall   StreamEventType = "tool_call"
	StreamEventEnd        StreamEventType = "end"
	StreamEventError      StreamEventType = "error"
)

// StreamEvent is emitted during streaming.
type StreamEvent struct {
	Type      StreamEventType        `json:"type"`
	MessageID string                 `json:"messageId"`
	Text      string                 `json:"text,omitempty"`
	ToolName  string                 `json:"toolName,omitempty"`
	ToolID    string                 `json:"toolId,omitempty"`
	ToolInput map[string]interface{} `json:"toolInput,omitempty"`
}

// apiStreamRequest is like apiRequest but with stream: true.
type apiStreamRequest struct {
	Model     string       `json:"model"`
	MaxTokens int          `json:"max_tokens"`
	System    string       `json:"system,omitempty"`
	Messages  []apiMessage `json:"messages"`
	Tools     []apiTool    `json:"tools,omitempty"`
	Stream    bool         `json:"stream"`
}

// SSE event types from Claude API
type sseMessageStart struct {
	Type    string `json:"type"`
	Message struct {
		ID string `json:"id"`
	} `json:"message"`
}

type sseContentBlockStart struct {
	Type         string `json:"type"`
	Index        int    `json:"index"`
	ContentBlock struct {
		Type  string `json:"type"`
		ID    string `json:"id,omitempty"`
		Name  string `json:"name,omitempty"`
		Text  string `json:"text,omitempty"`
	} `json:"content_block"`
}

type sseContentBlockDelta struct {
	Type  string `json:"type"`
	Index int    `json:"index"`
	Delta struct {
		Type        string          `json:"type"`
		Text        string          `json:"text,omitempty"`
		PartialJSON string          `json:"partial_json,omitempty"`
	} `json:"delta"`
}
```

- [ ] **Step 2: 添加 ChatStream 方法**

在 `internal/ai/claude.go` 中，在 `Chat` 方法之后添加 `ChatStream` 方法：

```go
// ChatStream sends a streaming conversation to Claude.
// The onEvent callback is called for each stream event.
// Returns the full text, tool calls, and any error.
func (c *ClaudeClient) ChatStream(messages []ChatMessage, taskContext string, onEvent func(StreamEvent)) (string, []ToolCall, error) {
	systemPrompt := `你是 TaskPilot AI 助手，帮助用户管理项目和任务。用户的任务数据会作为上下文提供。你可以使用工具来创建、更新、查询、删除任务。请用中文回复。

当用户的消息看起来是在描述一个任务时（如"明天下午3点前完成设计稿"），你应该：
1. 提取任务标题、截止日期（转为 ISO 8601 格式 YYYY-MM-DD）、优先级（P0-P3 对应 0-3）、所属项目
2. 如果信息不完整，使用合理默认值（优先级默认 1，项目使用上下文中最近活跃的项目）
3. 调用 create_task 工具创建任务
4. 回复确认创建结果，包含解析出的各字段`

	if taskContext != "" {
		systemPrompt += "\n\n当前任务数据（JSON格式）：\n" + taskContext
	}

	apiMsgs := make([]apiMessage, len(messages))
	for i, m := range messages {
		apiMsgs[i] = apiMessage{Role: m.Role, Content: m.Content}
	}

	req := apiStreamRequest{
		Model:     c.model,
		MaxTokens: 4096,
		System:    systemPrompt,
		Messages:  apiMsgs,
		Tools:     chatTools(),
		Stream:    true,
	}

	logger.Log.Info("AI streaming request", "model", req.Model, "url", c.baseURL, "messages", len(req.Messages))

	body, err := json.Marshal(req)
	if err != nil {
		return "", nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, c.baseURL, bytes.NewReader(body))
	if err != nil {
		return "", nil, fmt.Errorf("create http request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", c.apiKey)
	httpReq.Header.Set("anthropic-version", anthropicVersion)

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return "", nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		logger.Log.Error("AI streaming error", "status", resp.StatusCode, "body", string(respBody))
		return "", nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(respBody))
	}

	return c.parseSSEStream(resp.Body, onEvent)
}

// parseSSEStream reads SSE events from the response body.
func (c *ClaudeClient) parseSSEStream(body io.Reader, onEvent func(StreamEvent)) (string, []ToolCall, error) {
	scanner := bufio.NewScanner(body)
	// Increase scanner buffer for large SSE data lines
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var (
		fullText      string
		toolCalls     []ToolCall
		messageID     string
		currentBlockType string
		currentToolID    string
		currentToolName  string
		toolInputJSON    string
	)

	for scanner.Scan() {
		line := scanner.Text()

		// SSE format: "event: <type>\ndata: <json>\n\n"
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		// Parse the event type from the JSON
		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(data), &raw); err != nil {
			continue
		}

		eventType, _ := raw["type"].(string)

		switch eventType {
		case "message_start":
			var evt sseMessageStart
			json.Unmarshal([]byte(data), &evt)
			messageID = evt.Message.ID
			onEvent(StreamEvent{
				Type:      StreamEventStart,
				MessageID: messageID,
			})

		case "content_block_start":
			var evt sseContentBlockStart
			json.Unmarshal([]byte(data), &evt)
			currentBlockType = evt.ContentBlock.Type
			if currentBlockType == "tool_use" {
				currentToolID = evt.ContentBlock.ID
				currentToolName = evt.ContentBlock.Name
				toolInputJSON = ""
			}

		case "content_block_delta":
			var evt sseContentBlockDelta
			json.Unmarshal([]byte(data), &evt)

			if evt.Delta.Type == "text_delta" {
				fullText += evt.Delta.Text
				onEvent(StreamEvent{
					Type:      StreamEventChunk,
					MessageID: messageID,
					Text:      evt.Delta.Text,
				})
			} else if evt.Delta.Type == "input_json_delta" {
				toolInputJSON += evt.Delta.PartialJSON
			}

		case "content_block_stop":
			if currentBlockType == "tool_use" {
				var input map[string]interface{}
				if toolInputJSON != "" {
					json.Unmarshal([]byte(toolInputJSON), &input)
				}
				toolCalls = append(toolCalls, ToolCall{
					Name:  currentToolName,
					Input: input,
				})
				onEvent(StreamEvent{
					Type:      StreamEventToolCall,
					MessageID: messageID,
					ToolName:  currentToolName,
					ToolID:    currentToolID,
					ToolInput: input,
				})
			}
			currentBlockType = ""

		case "message_stop":
			onEvent(StreamEvent{
				Type:      StreamEventEnd,
				MessageID: messageID,
			})
		}
	}

	if err := scanner.Err(); err != nil {
		return fullText, toolCalls, fmt.Errorf("read SSE stream: %w", err)
	}

	return fullText, toolCalls, nil
}
```

- [ ] **Step 3: 添加 import "bufio"**

在 `internal/ai/claude.go` 的 import 块中添加 `"bufio"`：

```go
import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"taskpilot/internal/logger"
)
```

- [ ] **Step 4: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add internal/ai/claude.go
git commit -m "feat: Claude Streaming API (SSE) 支持"
```

---

### Task 4: AI 新增功能 — GetProactiveSuggestions + AutoTagTask

**Files:**
- Modify: `internal/ai/claude.go`

- [ ] **Step 1: 添加 GetProactiveSuggestions 方法**

在 `internal/ai/claude.go` 的 `GenerateWeeklyReport` 方法之后添加：

```go
// GetProactiveSuggestions analyzes tasks and returns proactive suggestions.
func (c *ClaudeClient) GetProactiveSuggestions(tasks []map[string]interface{}, projectName string) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`基于项目「%s」的当前任务状态，给出 3-5 条简短的工作建议。

分析维度：
- 逾期未完成的任务（需要立即处理）
- 今日到期的任务
- 超过 3 天未更新的进行中任务（可能被遗忘）
- 优先级调整建议

每条建议用一行，格式：「emoji 建议内容」。简洁有力，不要废话。
如果一切正常，就说"一切顺利"并给出鼓励。

当前任务数据：
%s`, projectName, string(taskJSON))

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 512,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return "", err
	}
	return c.extractText(resp), nil
}
```

- [ ] **Step 2: 添加 AutoTagTask 方法**

在 `GetProactiveSuggestions` 方法之后添加：

```go
// AutoTagTask uses AI to generate tags for a task.
func (c *ClaudeClient) AutoTagTask(title, description string, existingTags []string) ([]string, error) {
	tagsContext := ""
	if len(existingTags) > 0 {
		tagsJSON, _ := json.Marshal(existingTags)
		tagsContext = fmt.Sprintf("\n项目中已有的标签（尽量复用）：%s", string(tagsJSON))
	}

	prompt := fmt.Sprintf(`为以下任务生成 1-3 个简短的中文标签。
标签应反映任务的类别或领域（如"前端"、"设计"、"修复"、"文档"等）。
仅返回标签，用逗号分隔，不要其他内容。%s

任务标题：%s
任务描述：%s`, tagsContext, title, description)

	req := apiRequest{
		Model:     c.model,
		MaxTokens: 64,
		Messages:  []apiMessage{{Role: "user", Content: prompt}},
	}

	resp, err := c.doRequest(req)
	if err != nil {
		return nil, err
	}

	text := strings.TrimSpace(c.extractText(resp))
	if text == "" {
		return nil, nil
	}

	var tags []string
	for _, t := range strings.Split(text, ",") {
		t = strings.TrimSpace(t)
		if t != "" {
			tags = append(tags, t)
		}
	}
	return tags, nil
}
```

- [ ] **Step 3: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add internal/ai/claude.go
git commit -m "feat: 新增 AI 主动建议和自动标签功能"
```

---

### Task 5: AIService — 流式聊天 + 对话持久化 + 主动建议 RPC

**Files:**
- Modify: `services/ai_service.go`
- Modify: `main.go`

- [ ] **Step 1: 更新 AIService 结构体和 imports**

替换 `services/ai_service.go` 的 import 和 AIService 结构体：

```go
package services

import (
	"encoding/json"
	"fmt"
	"strings"

	"taskpilot/internal/ai"
	"taskpilot/internal/core"
	"taskpilot/internal/logger"
	"taskpilot/internal/model"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// ChatResponse is returned from ChatWithAI to the frontend.
type ChatResponse struct {
	Text      string           `json:"text"`
	ToolCalls []ToolCallResult `json:"toolCalls"`
}

// ToolCallResult represents the outcome of a single AI tool call.
type ToolCallResult struct {
	Action  string `json:"action"`
	Success bool   `json:"success"`
	Message string `json:"message"`
}

// AIService handles AI chat and analysis features.
type AIService struct {
	Core        *core.AppCore
	aiClient    *ai.ClaudeClient
	chatHistory []ai.ChatMessage
}
```

- [ ] **Step 2: 添加 StreamChatWithAI 方法**

在 `services/ai_service.go` 的 `ChatWithAI` 方法之后添加：

```go
// StreamChatWithAI sends a message and streams the response via Wails events.
// It persists both user and assistant messages to the database.
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

	// Run streaming in a goroutine
	go func() {
		var toolResults []ToolCallResult

		text, toolCalls, err := s.aiClient.ChatStream(s.chatHistory, string(taskJSON), func(evt ai.StreamEvent) {
			switch evt.Type {
			case ai.StreamEventStart:
				app.Event.Emit("ai:stream:start", map[string]string{
					"messageId": evt.MessageID,
				})
			case ai.StreamEventChunk:
				app.Event.Emit("ai:stream:chunk", map[string]string{
					"messageId": evt.MessageID,
					"text":      evt.Text,
				})
			case ai.StreamEventToolCall:
				app.Event.Emit("ai:stream:tool_call", map[string]interface{}{
					"messageId": evt.MessageID,
					"name":      evt.ToolName,
					"input":     evt.ToolInput,
				})
			case ai.StreamEventEnd:
				// Will be emitted after tool processing below
			case ai.StreamEventError:
				app.Event.Emit("ai:stream:error", map[string]string{
					"messageId": evt.MessageID,
					"error":     evt.Text,
				})
			}
		})

		if err != nil {
			logger.Log.Error("stream chat failed", "error", err)
			app.Event.Emit("ai:stream:error", map[string]string{
				"messageId": "",
				"error":     fmt.Sprintf("AI 对话失败: %v", err),
			})
			return
		}

		// Execute tool calls
		for _, tc := range toolCalls {
			result := s.executeToolCall(tc)
			toolResults = append(toolResults, result)
			app.Event.Emit("ai:stream:tool_result", map[string]interface{}{
				"messageId": "",
				"name":      tc.Name,
				"result":    result,
				"success":   result.Success,
			})
		}

		// Save assistant message to history
		s.chatHistory = append(s.chatHistory, ai.ChatMessage{
			Role:    "assistant",
			Content: text,
		})

		// Persist assistant message
		toolResultsJSON := "[]"
		if len(toolResults) > 0 {
			b, _ := json.Marshal(toolResults)
			toolResultsJSON = string(b)
		}
		s.Core.ChatStore.Save(projectID, "assistant", text, toolResultsJSON)

		// Emit end event
		app.Event.Emit("ai:stream:end", map[string]string{
			"messageId": "",
		})

		logger.Log.Info("stream chat completed", "textLen", len(text), "toolCalls", len(toolCalls))
	}()

	return nil
}
```

- [ ] **Step 3: 添加对话历史和主动建议 RPC 方法**

在 `services/ai_service.go` 的 `ClearChatHistory` 方法之后添加：

```go
// GetChatHistory returns persisted chat messages for a project.
func (s *AIService) GetChatHistory(projectID string, limit, offset int) ([]map[string]interface{}, error) {
	msgs, err := s.Core.ChatStore.GetMessages(projectID, limit, offset)
	if err != nil {
		return nil, err
	}
	var result []map[string]interface{}
	for _, m := range msgs {
		msg := map[string]interface{}{
			"id":        m.ID,
			"role":      m.Role,
			"content":   m.Content,
			"createdAt": m.CreatedAt,
		}
		// Parse tool results JSON back
		if m.ToolResults != "" && m.ToolResults != "[]" {
			var tr []ToolCallResult
			if json.Unmarshal([]byte(m.ToolResults), &tr) == nil && len(tr) > 0 {
				msg["toolResults"] = tr
			}
		}
		result = append(result, msg)
	}
	return result, nil
}

// ClearProjectChatHistory deletes all chat messages for a project.
func (s *AIService) ClearProjectChatHistory(projectID string) error {
	s.chatHistory = nil
	return s.Core.ChatStore.DeleteByProject(projectID)
}

// GetProactiveSuggestions returns AI suggestions based on current task state.
func (s *AIService) GetProactiveSuggestions(projectID string) (string, error) {
	if s.aiClient == nil {
		return "", fmt.Errorf("AI 未配置")
	}
	logger.Log.Info("getting proactive suggestions", "projectID", projectID)

	var tasks []model.Task
	var err error
	if projectID != "" {
		tasks, err = s.Core.TaskStore.ListByProject(projectID)
	} else {
		tasks, err = s.Core.TaskStore.ListAll()
	}
	if err != nil {
		return "", err
	}

	projectName := "所有项目"
	if projectID != "" {
		projects, _ := s.Core.ProjectStore.List()
		for _, p := range projects {
			if p.ID == projectID {
				projectName = p.Name
				break
			}
		}
	}

	result, err := s.aiClient.GetProactiveSuggestions(tasksToMaps(tasks), projectName)
	if err != nil {
		logger.Log.Error("proactive suggestions failed", "error", err)
		return "", err
	}
	return result, nil
}
```

- [ ] **Step 4: 更新 ClearChatHistory 方法以调用 ChatStore.DeleteAll**

替换现有的 `ClearChatHistory` 方法：

```go
func (s *AIService) ClearChatHistory() {
	s.chatHistory = nil
	s.Core.ChatStore.DeleteAll()
}
```

- [ ] **Step 5: 更新 tasksToMaps 以包含 tags**

替换 `tasksToMaps` 函数：

```go
func tasksToMaps(tasks []model.Task) []map[string]interface{} {
	var result []map[string]interface{}
	for _, t := range tasks {
		result = append(result, map[string]interface{}{
			"id": t.ID, "title": t.Title, "status": t.Status,
			"priority": t.Priority, "dueDate": t.DueDate,
			"projectId": t.ProjectID, "description": t.Description,
			"tags": t.Tags,
		})
	}
	return result
}
```

- [ ] **Step 6: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 7: Commit**

```bash
git add services/ai_service.go
git commit -m "feat: 流式聊天、对话持久化、主动建议 RPC"
```

---

### Task 6: TaskService — 异步自动标签

**Files:**
- Modify: `services/task_service.go`

- [ ] **Step 1: 在 TaskService 中添加 AI 客户端引用和自动标签方法**

在 `services/task_service.go` 中，修改 `TaskService` 结构体和添加自动标签逻辑：

```go
package services

import (
	"fmt"
	"strings"

	"taskpilot/internal/ai"
	"taskpilot/internal/core"
	"taskpilot/internal/logger"
	"taskpilot/internal/model"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// TaskService handles task CRUD operations.
type TaskService struct {
	Core     *core.AppCore
	AIClient func() *ai.ClaudeClient // lazy getter to avoid circular init
}

func (s *TaskService) CreateTask(title, projectId, description string, priority int, dueDate string) (*model.Task, error) {
	logger.Log.Info("creating task", "title", title, "projectId", projectId, "priority", priority)
	t := model.Task{
		Title:       title,
		ProjectID:   projectId,
		Description: description,
		Priority:    priority,
		DueDate:     dueDate,
		Status:      "todo",
	}
	if err := s.Core.TaskStore.Create(t); err != nil {
		logger.Log.Error("create task failed", "title", title, "error", err)
		return nil, err
	}
	tasks, err := s.Core.TaskStore.ListAll()
	if err != nil {
		return nil, err
	}
	for i := len(tasks) - 1; i >= 0; i-- {
		if tasks[i].Title == title && tasks[i].ProjectID == projectId {
			result := tasks[i]
			s.emitChange()
			// Trigger async auto-tag
			go s.autoTag(result.ID, result.Title, result.Description, result.ProjectID)
			return &result, nil
		}
	}
	return nil, fmt.Errorf("task created but could not be retrieved")
}

func (s *TaskService) UpdateTask(id, title, projectId, description, status string, priority int, dueDate string) error {
	logger.Log.Info("updating task", "id", id, "status", status)
	err := s.Core.TaskStore.Update(model.Task{
		ID:          id,
		Title:       title,
		ProjectID:   projectId,
		Description: description,
		Status:      status,
		Priority:    priority,
		DueDate:     dueDate,
	})
	if err == nil {
		s.emitChange()
		// Trigger async auto-tag on title/description change
		go s.autoTag(id, title, description, projectId)
	}
	return err
}

func (s *TaskService) DeleteTask(id string) error {
	logger.Log.Info("deleting task", "id", id)
	err := s.Core.TaskStore.Delete(id)
	if err == nil {
		s.emitChange()
	}
	return err
}

func (s *TaskService) GetTasksByProject(projectId string) ([]model.Task, error) {
	return s.Core.TaskStore.ListByProject(projectId)
}

func (s *TaskService) GetTodayTasks() ([]model.Task, error) {
	return s.Core.TaskStore.ListTodayTasks()
}

func (s *TaskService) GetAllTasks() ([]model.Task, error) {
	return s.Core.TaskStore.ListAll()
}

func (s *TaskService) emitChange() {
	app := application.Get()
	if app != nil {
		app.Event.Emit("task:changed", nil)
	}
}

func (s *TaskService) autoTag(taskID, title, description, projectID string) {
	if s.AIClient == nil {
		return
	}
	client := s.AIClient()
	if client == nil {
		return
	}

	// Collect existing tags from the project for consistency
	tasks, err := s.Core.TaskStore.ListByProject(projectID)
	if err != nil {
		return
	}
	tagSet := make(map[string]bool)
	for _, t := range tasks {
		if t.Tags != "" {
			for _, tag := range strings.Split(t.Tags, ",") {
				tag = strings.TrimSpace(tag)
				if tag != "" {
					tagSet[tag] = true
				}
			}
		}
	}
	var existingTags []string
	for tag := range tagSet {
		existingTags = append(existingTags, tag)
	}

	tags, err := client.AutoTagTask(title, description, existingTags)
	if err != nil {
		logger.Log.Error("auto tag failed", "taskID", taskID, "error", err)
		return
	}
	if len(tags) == 0 {
		return
	}

	tagsStr := strings.Join(tags, ",")
	logger.Log.Info("auto tag result", "taskID", taskID, "tags", tagsStr)

	// Update task tags in DB
	task, err := s.Core.TaskStore.GetByID(taskID)
	if err != nil || task == nil {
		return
	}
	task.Tags = tagsStr
	if err := s.Core.TaskStore.Update(*task); err != nil {
		logger.Log.Error("auto tag update failed", "taskID", taskID, "error", err)
		return
	}

	// Notify frontend
	app := application.Get()
	if app != nil {
		app.Event.Emit("task:tags:updated", map[string]string{
			"taskId": taskID,
			"tags":   tagsStr,
		})
		app.Event.Emit("task:changed", nil)
	}
}
```

- [ ] **Step 2: 更新 main.go 中 TaskService 的初始化**

在 `main.go` 中，将 `taskSvc` 初始化改为：

```go
taskSvc := &services.TaskService{
    Core:     appCore,
    AIClient: func() *ai.ClaudeClient { return aiSvc.GetAIClient() },
}
```

然后在 `internal/ai/claude.go` 不需要改动（AIClient 是 `*ai.ClaudeClient` 类型）。

需要在 `services/ai_service.go` 中添加一个 getter：

```go
// GetAIClient returns the current AI client (may be nil).
func (s *AIService) GetAIClient() *ai.ClaudeClient {
	return s.aiClient
}
```

同时 `main.go` 需要 import ai 包：

```go
import (
	"embed"
	"log"
	"path/filepath"
	"runtime"

	"taskpilot/internal/ai"
	"taskpilot/internal/core"
	"taskpilot/services"

	"github.com/wailsapp/wails/v3/pkg/application"
)
```

但 `ai` 在 `main.go` 中仅用于 `func() *ai.ClaudeClient` 类型。由于 Go 的类型推断，如果 `aiSvc.GetAIClient()` 返回 `*ai.ClaudeClient`，则 `main.go` 必须 import `taskpilot/internal/ai`。

实际上更简单的方式是让 `TaskService.AIClient` 的类型不暴露 `ai` 包，直接用 closure 避免类型依赖：

将 `TaskService` 中的字段改为更通用的：

```go
type TaskService struct {
	Core        *core.AppCore
	AutoTagFunc func(title, description string, existingTags []string) ([]string, error) // optional
}
```

然后 `main.go` 中：

```go
taskSvc := &services.TaskService{Core: appCore}

// After aiSvc.ReloadClient()
taskSvc.AutoTagFunc = func(title, description string, existingTags []string) ([]string, error) {
    client := aiSvc.GetAIClient()
    if client == nil {
        return nil, nil
    }
    return client.AutoTagTask(title, description, existingTags)
}
```

这样 `main.go` 不需要 import `ai` 包。更新 `autoTag` 方法使用 `s.AutoTagFunc`：

```go
func (s *TaskService) autoTag(taskID, title, description, projectID string) {
	if s.AutoTagFunc == nil {
		return
	}

	// Collect existing tags from the project for consistency
	tasks, err := s.Core.TaskStore.ListByProject(projectID)
	if err != nil {
		return
	}
	tagSet := make(map[string]bool)
	for _, t := range tasks {
		if t.Tags != "" {
			for _, tag := range strings.Split(t.Tags, ",") {
				tag = strings.TrimSpace(tag)
				if tag != "" {
					tagSet[tag] = true
				}
			}
		}
	}
	var existingTags []string
	for tag := range tagSet {
		existingTags = append(existingTags, tag)
	}

	tags, err := s.AutoTagFunc(title, description, existingTags)
	if err != nil {
		logger.Log.Error("auto tag failed", "taskID", taskID, "error", err)
		return
	}
	if len(tags) == 0 {
		return
	}

	tagsStr := strings.Join(tags, ",")
	logger.Log.Info("auto tag result", "taskID", taskID, "tags", tagsStr)

	task, err := s.Core.TaskStore.GetByID(taskID)
	if err != nil || task == nil {
		return
	}
	task.Tags = tagsStr
	if err := s.Core.TaskStore.Update(*task); err != nil {
		logger.Log.Error("auto tag update failed", "taskID", taskID, "error", err)
		return
	}

	app := application.Get()
	if app != nil {
		app.Event.Emit("task:tags:updated", map[string]string{
			"taskId": taskID,
			"tags":   tagsStr,
		})
		app.Event.Emit("task:changed", nil)
	}
}
```

- [ ] **Step 3: 更新 main.go**

在 `main.go` 的 `aiSvc.ReloadClient()` 之后添加 AutoTagFunc 赋值：

```go
// Initialize AI client from stored config.
aiSvc.ReloadClient()

// Wire up auto-tagging
taskSvc.AutoTagFunc = func(title, description string, existingTags []string) ([]string, error) {
    client := aiSvc.GetAIClient()
    if client == nil {
        return nil, nil
    }
    return client.AutoTagTask(title, description, existingTags)
}
```

- [ ] **Step 4: 验证编译通过**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add services/task_service.go services/ai_service.go main.go
git commit -m "feat: 任务创建/更新时异步自动标签"
```

---

### Task 7: 前端 — 安装 Streamdown + MarkdownRenderer 组件

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/components/MarkdownRenderer.tsx`

- [ ] **Step 1: 安装 streamdown 依赖**

Run: `cd /Users/dong/Desktop/Projects/taskpilot/frontend && npm install streamdown @streamdown/code`

Expected: 安装成功，无错误

- [ ] **Step 2: 创建 MarkdownRenderer 组件**

创建 `frontend/src/components/MarkdownRenderer.tsx`：

```tsx
import { Streamdown } from 'streamdown'
import { code, cjk } from '@streamdown/code'
import 'streamdown/themes/default.css'

interface MarkdownRendererProps {
  content: string
  isStreaming?: boolean
}

const plugins = { code, cjk }

export default function MarkdownRenderer({ content, isStreaming = false }: MarkdownRendererProps) {
  return (
    <Streamdown
      plugins={plugins}
      isAnimating={isStreaming}
    >
      {content}
    </Streamdown>
  )
}
```

注意：如果 `streamdown/themes/default.css` 路径不存在，需要根据实际的包结构调整导入路径。安装后检查 `node_modules/streamdown` 中的实际文件结构。

- [ ] **Step 3: 验证前端构建**

Run: `cd /Users/dong/Desktop/Projects/taskpilot/frontend && npx tsc --noEmit`
Expected: 无类型错误（如果有 CSS 导入错误可忽略，Vite 运行时处理）

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/MarkdownRenderer.tsx
git commit -m "feat: 安装 Streamdown，创建 MarkdownRenderer 组件"
```

---

### Task 8: 前端 — useAIStream Hook

**Files:**
- Create: `frontend/src/hooks/useAIStream.ts`
- Modify: `frontend/src/hooks/useWails.ts`

- [ ] **Step 1: 添加新的 RPC 绑定到 useWails.ts**

在 `frontend/src/hooks/useWails.ts` 的 AI 相关部分之后，添加：

```typescript
// ---- AI 流式 & 持久化 ----

export async function streamChatWithAI(message: string, projectId: string): Promise<void> {
  await AIService.StreamChatWithAI(message, projectId)
}

export async function getChatHistory(projectId: string, limit: number, offset: number): Promise<ChatHistoryItem[]> {
  const result = await AIService.GetChatHistory(projectId, limit, offset)
  return result || []
}

export async function clearProjectChatHistory(projectId: string): Promise<void> {
  await AIService.ClearProjectChatHistory(projectId)
}

export async function getProactiveSuggestions(projectId: string): Promise<string> {
  return await AIService.GetProactiveSuggestions(projectId)
}

export interface ChatHistoryItem {
  id: string
  role: 'user' | 'assistant'
  content: string
  toolResults?: { action: string; success: boolean; message: string }[]
  createdAt: string
}
```

- [ ] **Step 2: 创建 useAIStream hook**

创建 `frontend/src/hooks/useAIStream.ts`：

```typescript
import { useState, useEffect, useCallback, useRef } from 'react'
import { Events } from '@wailsio/runtime'
import { streamChatWithAI } from './useWails'
import { useAppStore } from '../stores/appStore'

export type StreamStatus = 'idle' | 'streaming' | 'tool_calling' | 'error'

export function useAIStream() {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const [streamingContent, setStreamingContent] = useState('')
  const [toolResults, setToolResults] = useState<{ action: string; success: boolean; message: string }[]>([])
  const contentRef = useRef('')
  const toolResultsRef = useRef<{ action: string; success: boolean; message: string }[]>([])
  const { addChatMessage, selectedProjectId } = useAppStore()

  useEffect(() => {
    const unsubStart = Events.On('ai:stream:start', () => {
      setStatus('streaming')
      setStreamingContent('')
      setToolResults([])
      contentRef.current = ''
      toolResultsRef.current = []
    })

    const unsubChunk = Events.On('ai:stream:chunk', (event: any) => {
      const data = event.data?.[0] || event.data || event
      const text = data.text || ''
      contentRef.current += text
      setStreamingContent(contentRef.current)
    })

    const unsubToolCall = Events.On('ai:stream:tool_call', () => {
      setStatus('tool_calling')
    })

    const unsubToolResult = Events.On('ai:stream:tool_result', (event: any) => {
      const data = event.data?.[0] || event.data || event
      const result = data.result || data
      const tr = {
        action: result.Action || result.action || data.name || '',
        success: result.Success ?? result.success ?? false,
        message: result.Message || result.message || '',
      }
      toolResultsRef.current = [...toolResultsRef.current, tr]
      setToolResults([...toolResultsRef.current])
      setStatus('streaming')
    })

    const unsubEnd = Events.On('ai:stream:end', () => {
      const finalContent = contentRef.current
      const finalToolResults = toolResultsRef.current
      setStatus('idle')
      // Note: the message is already persisted by the backend.
      // We add it to the local store for immediate display.
      if (finalContent) {
        addChatMessage({
          role: 'assistant',
          content: finalContent,
          toolResults: finalToolResults.length > 0 ? [...finalToolResults] : undefined,
          timestamp: Date.now(),
        })
      }
      setStreamingContent('')
      setToolResults([])
      contentRef.current = ''
      toolResultsRef.current = []
    })

    const unsubError = Events.On('ai:stream:error', (event: any) => {
      const data = event.data?.[0] || event.data || event
      const errorMsg = data.error || 'AI 服务出错'
      setStatus('error')
      addChatMessage({
        role: 'assistant',
        content: errorMsg,
        timestamp: Date.now(),
        isError: true,
      })
      setStreamingContent('')
      contentRef.current = ''
    })

    return () => {
      unsubStart?.()
      unsubChunk?.()
      unsubToolCall?.()
      unsubToolResult?.()
      unsubEnd?.()
      unsubError?.()
    }
  }, [addChatMessage])

  const sendMessage = useCallback(async (message: string) => {
    const projectId = selectedProjectId || ''
    addChatMessage({ role: 'user', content: message, timestamp: Date.now() })
    setStatus('streaming')
    setStreamingContent('')
    contentRef.current = ''
    try {
      await streamChatWithAI(message, projectId)
    } catch {
      setStatus('error')
      addChatMessage({
        role: 'assistant',
        content: '抱歉，AI 服务出错了。请检查 API Key 设置。',
        timestamp: Date.now(),
        isError: true,
      })
    }
  }, [addChatMessage, selectedProjectId])

  return {
    status,
    streamingContent,
    toolResults,
    sendMessage,
  }
}
```

- [ ] **Step 3: 验证前端类型**

Run: `cd /Users/dong/Desktop/Projects/taskpilot/frontend && npx tsc --noEmit`
Expected: 无错误（或仅 CSS 相关警告）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useAIStream.ts frontend/src/hooks/useWails.ts
git commit -m "feat: useAIStream hook + 新 RPC 绑定"
```

---

### Task 9: 前端 — ChatPanel 重构（流式 + Streamdown）

> **DEPENDENCY:** 先完成 Task 10 (ProactiveSuggestions)，ChatPanel 导入了该组件。

**Files:**
- Modify: `frontend/src/components/ChatPanel.tsx`

- [ ] **Step 1: 重写 ChatPanel 使用流式渲染**

替换整个 `frontend/src/components/ChatPanel.tsx`：

```tsx
import React, { useRef, useEffect, useState, KeyboardEvent } from 'react'
import { motion } from 'motion/react'
import { X, Trash2, Send, Bot, User, Loader2, AlertCircle, Wrench } from 'lucide-react'
import { FiClipboard as _FiClipboard, FiTarget as _FiTarget, FiBarChart2 as _FiBarChart2, FiPlusCircle as _FiPlusCircle } from 'react-icons/fi'

type FiIcon = React.FC<{ size?: number; className?: string }>
const FiClipboard = _FiClipboard as unknown as FiIcon
const FiTarget = _FiTarget as unknown as FiIcon
const FiBarChart2 = _FiBarChart2 as unknown as FiIcon
const FiPlusCircle = _FiPlusCircle as unknown as FiIcon

import { useAppStore } from '../stores/appStore'
import { clearChatHistory as clearChatHistoryAPI } from '../hooks/useWails'
import { useAIStream } from '../hooks/useAIStream'
import MarkdownRenderer from './MarkdownRenderer'
import ProactiveSuggestions from './ProactiveSuggestions'

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      <span className="loading-dot w-1.5 h-1.5 rounded-full bg-stone-400" style={{ animationDelay: '0ms' }} />
      <span className="loading-dot w-1.5 h-1.5 rounded-full bg-stone-400" style={{ animationDelay: '150ms' }} />
      <span className="loading-dot w-1.5 h-1.5 rounded-full bg-stone-400" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

const QUICK_PROMPTS: { icon: FiIcon; label: string; text: string }[] = [
  { icon: FiClipboard, label: '总结今日进度', text: '总结今日进度' },
  { icon: FiTarget, label: '帮我规划今天的任务', text: '帮我规划今天的任务' },
  { icon: FiBarChart2, label: '本周完成了哪些任务？', text: '本周完成了哪些任务？' },
  { icon: FiPlusCircle, label: '创建一个新任务', text: '创建一个新任务' },
]

export default function ChatPanel({ standalone = false }: { standalone?: boolean }) {
  const { chatMessages, addChatMessage, clearChatMessages, toggleChatPanel } = useAppStore()
  const { status, streamingContent, toolResults, sendMessage } = useAIStream()
  const [input, setInput] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const confirmClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isStreaming = status === 'streaming' || status === 'tool_calling'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, streamingContent, status])

  useEffect(() => {
    return () => {
      if (confirmClearTimerRef.current) clearTimeout(confirmClearTimerRef.current)
    }
  }, [])

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true)
      confirmClearTimerRef.current = setTimeout(() => setConfirmClear(false), 3000)
      return
    }
    if (confirmClearTimerRef.current) clearTimeout(confirmClearTimerRef.current)
    setConfirmClear(false)
    try {
      await clearChatHistoryAPI()
    } catch (_e) {
      // ignore backend error, still clear frontend
    }
    clearChatMessages()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    const el = e.target
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 96) + 'px'
  }

  const handleSend = async (message: string) => {
    const trimmed = message.trim()
    if (!trimmed || isStreaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend(input)
    }
  }

  return (
    <div className="flex flex-col w-full h-full bg-white/80 backdrop-blur-xl border-l border-stone-200/60 flex-shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 glass">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Bot size={14} className="text-indigo-500" />
          </div>
          <span className="font-semibold text-stone-800 text-sm">AI 助手</span>
          {isStreaming && (
            <span className="text-[10px] text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded-full font-medium">
              {status === 'tool_calling' ? '执行中...' : '思考中...'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={handleClear}
            className={`p-1.5 rounded-lg transition-colors text-xs flex items-center gap-1 ${
              confirmClear
                ? 'bg-red-50 text-red-500 hover:bg-red-100 px-2'
                : 'hover:bg-stone-100 text-stone-400 hover:text-stone-600'
            }`}
            title={confirmClear ? '再次点击确认清空' : '清空对话'}
          >
            <Trash2 size={14} />
            {confirmClear && <span className="font-medium">确认清空?</span>}
          </button>
          {!standalone && (
            <button
              onClick={toggleChatPanel}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
              title="关闭"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {chatMessages.length === 0 && !isStreaming ? (
          <div className="flex flex-col gap-3">
            {/* Proactive Suggestions */}
            <ProactiveSuggestions onSend={handleSend} />
            <div className="flex flex-col items-center gap-2 py-8 text-stone-400">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
                <Bot size={24} className="text-indigo-400" />
              </div>
              <p className="text-sm mt-1">有什么可以帮你的吗？</p>
            </div>
            <div className="flex flex-col gap-2">
              {QUICK_PROMPTS.map((p, idx) => (
                <motion.button
                  key={p.text}
                  initial={{ y: 8 }}
                  animate={{ y: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ x: 4 }}
                  onClick={() => handleSend(p.text)}
                  className="flex items-center gap-2.5 text-left px-3.5 py-2.5 rounded-xl border border-stone-200/80 text-sm text-stone-600 hover:bg-indigo-50/50 hover:border-indigo-200 hover:text-indigo-700 transition-colors"
                >
                  <p.icon size={14} className="flex-shrink-0 opacity-60" />
                  {p.label}
                </motion.button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {chatMessages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center mt-0.5">
                    <Bot size={12} className="text-indigo-500" />
                  </div>
                )}
                <div className="max-w-[78%] flex flex-col gap-1.5">
                  <div
                    className={`px-3 py-2 rounded-2xl text-[13px] leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-500 text-white rounded-br-md'
                        : msg.isError
                        ? 'bg-red-50/80 text-red-700 border border-red-200/60 rounded-bl-md'
                        : 'bg-stone-100/80 text-stone-700 rounded-bl-md'
                    }`}
                  >
                    {msg.role === 'assistant' ? (
                      msg.isError ? (
                        <div className="flex items-start gap-1.5">
                          <AlertCircle size={13} className="flex-shrink-0 mt-0.5" />
                          <span>{msg.content}</span>
                        </div>
                      ) : (
                        <MarkdownRenderer content={msg.content} isStreaming={false} />
                      )
                    ) : msg.content}
                  </div>
                  {msg.toolResults && msg.toolResults.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {msg.toolResults.map((tr, ti) => (
                        <div
                          key={ti}
                          className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${
                            tr.success
                              ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-700'
                              : 'border-red-200/60 bg-red-50/50 text-red-700'
                          }`}
                        >
                          <span className="mt-0.5 flex-shrink-0">{tr.success ? '✓' : '✗'}</span>
                          <div>
                            <span className="font-medium">{tr.action}</span>
                            {tr.message && <span className="ml-1 opacity-70">— {tr.message}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-500 flex items-center justify-center mt-0.5">
                    <User size={12} className="text-white" />
                  </div>
                )}
              </motion.div>
            ))}

            {/* Streaming message */}
            {isStreaming && (
              <div className="flex gap-2 justify-start">
                <div className="flex-shrink-0 w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center mt-0.5">
                  <Bot size={12} className="text-indigo-500" />
                </div>
                <div className="max-w-[78%] flex flex-col gap-1.5">
                  <div className="bg-stone-100/80 px-3 py-2 rounded-2xl rounded-bl-md text-[13px] text-stone-700">
                    {streamingContent ? (
                      <MarkdownRenderer content={streamingContent} isStreaming={true} />
                    ) : (
                      <LoadingDots />
                    )}
                  </div>
                  {/* Tool call results during streaming */}
                  {toolResults.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {toolResults.map((tr, ti) => (
                        <div
                          key={ti}
                          className={`flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-xs border ${
                            tr.success
                              ? 'border-emerald-200/60 bg-emerald-50/50 text-emerald-700'
                              : 'border-red-200/60 bg-red-50/50 text-red-700'
                          }`}
                        >
                          <Wrench size={11} className="mt-0.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium">{tr.action}</span>
                            {tr.message && <span className="ml-1 opacity-70">— {tr.message}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-stone-100 glass">
        <div className="flex items-end gap-2 bg-stone-50/80 border border-stone-200/60 rounded-xl px-3 py-2 focus-within:border-indigo-300 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.08)] transition-all">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isStreaming}
            placeholder="输入消息… (Enter 发送)"
            rows={1}
            className="flex-1 bg-transparent resize-none outline-none text-sm text-stone-800 placeholder-stone-400 leading-6 max-h-24 disabled:opacity-50"
          />
          <motion.button
            whileHover={!isStreaming ? { scale: 1.05 } : {}}
            whileTap={!isStreaming ? { scale: 0.95 } : {}}
            onClick={() => handleSend(input)}
            disabled={isStreaming || !input.trim()}
            className="flex-shrink-0 p-1.5 rounded-lg bg-indigo-500 text-white hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {isStreaming ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </motion.button>
        </div>
        <p className="text-[10px] text-stone-400 mt-1.5 text-center tracking-wide">Powered by Claude AI</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ChatPanel.tsx
git commit -m "feat: ChatPanel 重构 — 流式渲染 + Streamdown"
```

---

### Task 10: 前端 — ProactiveSuggestions 组件

**Files:**
- Create: `frontend/src/components/ProactiveSuggestions.tsx`

- [ ] **Step 1: 创建 ProactiveSuggestions 组件**

创建 `frontend/src/components/ProactiveSuggestions.tsx`：

```tsx
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Lightbulb, ChevronDown, ChevronUp } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { getProactiveSuggestions } from '../hooks/useWails'
import MarkdownRenderer from './MarkdownRenderer'

interface Props {
  onSend: (message: string) => void
}

// Cache suggestions per project with 30-minute TTL
const suggestionsCache: Record<string, { text: string; timestamp: number }> = {}
const CACHE_TTL = 30 * 60 * 1000 // 30 minutes

export default function ProactiveSuggestions({ onSend }: Props) {
  const { selectedProjectId } = useAppStore()
  const [suggestions, setSuggestions] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const fetchedRef = useRef<string | null>(null)

  useEffect(() => {
    const projectId = selectedProjectId || ''
    if (fetchedRef.current === projectId) return

    // Check cache
    const cached = suggestionsCache[projectId]
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setSuggestions(cached.text)
      fetchedRef.current = projectId
      return
    }

    fetchedRef.current = projectId
    setLoading(true)
    setSuggestions(null)

    getProactiveSuggestions(projectId)
      .then((text) => {
        setSuggestions(text)
        suggestionsCache[projectId] = { text, timestamp: Date.now() }
      })
      .catch(() => {
        // Silently fail — suggestions are optional
      })
      .finally(() => setLoading(false))
  }, [selectedProjectId])

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-xs text-stone-400">
        <Lightbulb size={12} className="animate-pulse" />
        <span>正在分析任务状态...</span>
      </div>
    )
  }

  if (!suggestions) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="bg-gradient-to-r from-amber-50/80 to-orange-50/60 border border-amber-200/50 rounded-xl overflow-hidden"
      >
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-between w-full px-3 py-2 text-xs font-medium text-amber-700 hover:bg-amber-100/30 transition-colors"
        >
          <div className="flex items-center gap-1.5">
            <Lightbulb size={12} />
            <span>AI 建议</span>
          </div>
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        {!collapsed && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="px-3 pb-2.5 text-[12px] text-stone-600 leading-relaxed cursor-pointer"
            onClick={() => onSend('请详细分析一下当前的任务状态并给出建议')}
            title="点击与 AI 深入讨论"
          >
            <MarkdownRenderer content={suggestions} />
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ProactiveSuggestions.tsx
git commit -m "feat: AI 主动建议组件"
```

---

### Task 11: 前端 — DailySummary 替换为 MarkdownRenderer

**Files:**
- Modify: `frontend/src/components/DailySummary.tsx`

- [ ] **Step 1: 简化 DailySummary，使用 MarkdownRenderer**

替换整个 `frontend/src/components/DailySummary.tsx`：

```tsx
import React from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'
import { FiBarChart2 as _FiBarChart2 } from 'react-icons/fi'
const FiBarChart2 = _FiBarChart2 as unknown as React.FC<{ size?: number; className?: string }>

import MarkdownRenderer from './MarkdownRenderer'

interface DailySummaryProps {
  summary: string
  onClose: () => void
}

export default function DailySummary({ summary, onClose }: DailySummaryProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, y: -10 }}
      animate={{ opacity: 1, height: 'auto', y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="mt-4 bg-white rounded-2xl border border-stone-200/60 overflow-hidden"
      style={{ boxShadow: 'var(--shadow-md)' }}
    >
      <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100 bg-gradient-to-r from-indigo-50/80 to-purple-50/60">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
          <FiBarChart2 size={14} className="text-indigo-500" />
          今日摘要
        </h3>
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-600 transition-colors p-0.5 rounded-md hover:bg-stone-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="px-5 py-4">
        <MarkdownRenderer content={summary} />
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/DailySummary.tsx
git commit -m "refactor: DailySummary 使用 MarkdownRenderer 替换手写解析"
```

---

### Task 12: 前端 — TaskItem 标签展示 + TaskForm 标签编辑

**Files:**
- Modify: `frontend/src/stores/appStore.ts`
- Modify: `frontend/src/components/TaskItem.tsx`
- Modify: `frontend/src/components/TaskForm.tsx`

- [ ] **Step 1: 更新 appStore 的 Task 接口**

在 `frontend/src/stores/appStore.ts` 的 `Task` 接口中添加 `tags` 字段：

```typescript
export interface Task {
  id: string
  projectId: string
  title: string
  description: string
  status: string  // todo, doing, done
  priority: number // 0-3
  dueDate: string
  tags: string     // 逗号分隔标签
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: 在 TaskItem 中展示标签**

在 `frontend/src/components/TaskItem.tsx` 中：

在 `dueDateLabel` 的显示之后、`</div>` 闭合之前，添加标签展示。在 `<div className="flex items-center gap-2 mt-0.5">` 块中，在 `dueDateLabel` 条件渲染之后添加：

```tsx
{task.tags && task.tags.split(',').filter(Boolean).map((tag, i) => (
  <span
    key={i}
    className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100/80 text-violet-600 font-medium"
  >
    {tag.trim()}
  </span>
))}
```

- [ ] **Step 3: 在 TaskForm 中添加标签编辑**

在 `frontend/src/components/TaskForm.tsx` 中：

添加 tags state（在其他 state 声明之后）：

```typescript
const [tags, setTags] = useState(task?.tags ?? '')
const [tagInput, setTagInput] = useState('')
```

在截止日期字段之后、`</div>` (space-y-4) 闭合之前，添加标签编辑区域：

```tsx
<div>
  <label className="block text-xs font-medium text-stone-600 mb-1.5">标签</label>
  <div className="flex flex-wrap gap-1.5 mb-2">
    {tags.split(',').filter(Boolean).map((tag, i) => (
      <span
        key={i}
        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-violet-100/80 text-violet-600 font-medium"
      >
        {tag.trim()}
        <button
          onClick={() => {
            const newTags = tags.split(',').filter((_, idx) => idx !== i).join(',')
            setTags(newTags)
          }}
          className="text-violet-400 hover:text-violet-700 transition-colors"
        >
          ×
        </button>
      </span>
    ))}
  </div>
  <div className="flex gap-2">
    <input
      type="text"
      value={tagInput}
      onChange={e => setTagInput(e.target.value)}
      onKeyDown={e => {
        if (e.key === 'Enter' && tagInput.trim()) {
          e.preventDefault()
          const current = tags ? tags.split(',').map(t => t.trim()) : []
          if (!current.includes(tagInput.trim())) {
            setTags([...current, tagInput.trim()].join(','))
          }
          setTagInput('')
        }
      }}
      placeholder="输入标签，按回车添加"
      className="flex-1 px-3 py-2 text-sm border border-stone-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
    />
  </div>
</div>
```

更新 `handleSave` 中的 API 调用。由于 `updateTask` 和 `createTask` 的 RPC 签名不包含 tags（tags 由后端自动生成），标签编辑需要通过单独的更新实现。

实际上，为了简化，我们可以在 `UpdateTask` RPC 中处理 tags。但当前 `TaskService.UpdateTask` 不接受 tags 参数。

最简方案：TaskForm 的手动标签编辑仅修改本地显示，后续通过 `task:changed` 事件同步。如果用户手动编辑了标签，前端直接调用一个新 RPC。

更简洁的做法：在现有 `UpdateTask` 中加入 tags 参数。但这改变了 RPC 签名，影响 Wails 绑定生成。

**最简方案**：暂时不在 TaskForm 中实现手动标签编辑保存，仅展示 AI 生成的标签。标签是只读展示。这符合设计：标签由 AI 自动生成。

简化 TaskForm 标签区域为只读展示：

```tsx
<div>
  <label className="block text-xs font-medium text-stone-600 mb-1.5">标签 <span className="text-stone-400 font-normal">（AI 自动生成）</span></label>
  <div className="flex flex-wrap gap-1.5">
    {(task?.tags || '').split(',').filter(Boolean).map((tag, i) => (
      <span
        key={i}
        className="text-xs px-2 py-1 rounded-full bg-violet-100/80 text-violet-600 font-medium"
      >
        {tag.trim()}
      </span>
    ))}
    {!(task?.tags) && <span className="text-xs text-stone-400">保存后 AI 将自动生成标签</span>}
  </div>
</div>
```

- [ ] **Step 4: 更新 useWailsEvents 监听 tags 更新**

在 `frontend/src/hooks/useWailsEvents.ts` 中添加 tags 更新事件监听：

```typescript
import { useEffect } from 'react'
import { Events } from '@wailsio/runtime'
import { useAppStore } from '../stores/appStore'
import { getProjects, getAllTasks } from './useWails'

export function useWailsEvents() {
  const { setProjects, setTasks } = useAppStore()

  useEffect(() => {
    const unsubProject = Events.On('project:changed', async () => {
      const projects = await getProjects()
      setProjects(projects || [])
    })

    const unsubTask = Events.On('task:changed', async () => {
      const tasks = await getAllTasks()
      setTasks(tasks || [])
    })

    const unsubTags = Events.On('task:tags:updated', async () => {
      // Refresh tasks to get updated tags
      const tasks = await getAllTasks()
      setTasks(tasks || [])
    })

    return () => {
      if (unsubProject) unsubProject()
      if (unsubTask) unsubTask()
      if (unsubTags) unsubTags()
    }
  }, [setProjects, setTasks])
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/stores/appStore.ts frontend/src/components/TaskItem.tsx frontend/src/components/TaskForm.tsx frontend/src/hooks/useWailsEvents.ts
git commit -m "feat: 任务标签展示 + 标签更新事件监听"
```

---

### Task 13: 前端 — 对话历史加载

**Files:**
- Modify: `frontend/src/stores/appStore.ts`
- Modify: `frontend/src/components/ChatPanel.tsx`

- [ ] **Step 1: 在 appStore 中添加对话历史加载方法**

在 `frontend/src/stores/appStore.ts` 中，向接口和实现中添加加载方法：

在 `AppState` 接口中添加：
```typescript
loadChatHistory: (projectId: string) => Promise<void>
```

在 store 实现中添加：
```typescript
loadChatHistory: async (projectId: string) => {
  try {
    const { getChatHistory } = await import('../hooks/useWails')
    const history = await getChatHistory(projectId, 50, 0)
    const messages: ChatMessage[] = history.map(h => ({
      role: h.role,
      content: h.content,
      toolResults: h.toolResults,
      timestamp: new Date(h.createdAt).getTime(),
    }))
    set({ chatMessages: messages })
  } catch {
    // Silently fail — fresh chat is fine
  }
},
```

- [ ] **Step 2: 在 ChatPanel 中加载对话历史**

在 `frontend/src/components/ChatPanel.tsx` 中，在组件顶部的 `useAppStore` 解构中添加 `loadChatHistory` 和 `selectedProjectId`：

```typescript
const { chatMessages, addChatMessage, clearChatMessages, toggleChatPanel, loadChatHistory, selectedProjectId } = useAppStore()
```

添加一个 useEffect 在项目切换时加载历史：

```typescript
useEffect(() => {
  loadChatHistory(selectedProjectId || '')
}, [selectedProjectId, loadChatHistory])
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/appStore.ts frontend/src/components/ChatPanel.tsx
git commit -m "feat: 对话历史持久化加载"
```

---

### Task 14: 构建验证

**Files:** None (verification only)

- [ ] **Step 1: 重新生成 Wails 绑定**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && wails3 generate bindings`
Expected: 绑定生成成功，frontend/bindings/ 目录更新

- [ ] **Step 2: 安装前端依赖并构建**

Run: `cd /Users/dong/Desktop/Projects/taskpilot/frontend && npm install && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Go 编译验证**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && go build ./...`
Expected: 编译成功

- [ ] **Step 4: 完整构建验证**

Run: `cd /Users/dong/Desktop/Projects/taskpilot && wails3 build`
Expected: 构建成功，生成可执行文件

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: 更新 Wails 绑定，验证完整构建"
```
