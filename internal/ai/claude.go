package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"

	"taskpilot/internal/logger"
)

// ContentBlock represents a single block in a multi-block message (text, tool_use, or tool_result).
type ContentBlock struct {
	Type      string                 `json:"type"`                  // "text", "tool_use", "tool_result"
	Text      string                 `json:"text,omitempty"`        // for type="text"
	ID        string                 `json:"id,omitempty"`          // for type="tool_use"
	Name      string                 `json:"name,omitempty"`        // for type="tool_use"
	Input     map[string]interface{} `json:"input,omitempty"`       // for type="tool_use"
	ToolUseID string                 `json:"tool_use_id,omitempty"` // for type="tool_result"
	Content   string                 `json:"content,omitempty"`     // for type="tool_result"
}

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role          string         `json:"role"`
	Content       string         `json:"content,omitempty"`
	ContentBlocks []ContentBlock `json:"content_blocks,omitempty"`
}

// ToolCall represents a tool invocation requested by the model.
type ToolCall struct {
	ID    string                 `json:"id"`
	Name  string                 `json:"name"`
	Input map[string]interface{} `json:"input"`
}

// ClaudeClient wraps the Claude API via the official SDK.
type ClaudeClient struct {
	client  *anthropic.Client
	model   anthropic.Model
	baseURL string // kept for logging
}

// NewClaudeClient creates a new ClaudeClient with the given API key, base URL, and model.
func NewClaudeClient(apiKey, baseURL, model string) *ClaudeClient {
	if model == "" {
		model = string(anthropic.ModelClaudeSonnet4_20250514)
	}

	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}

	// Normalise baseURL: strip /v1/messages or /v1 suffix, then decide whether
	// to pass it to the SDK.
	cleanURL := strings.TrimRight(baseURL, "/")
	cleanURL = strings.TrimSuffix(cleanURL, "/v1/messages")
	cleanURL = strings.TrimSuffix(cleanURL, "/v1")
	cleanURL = strings.TrimRight(cleanURL, "/")

	if cleanURL != "" && !strings.Contains(cleanURL, "api.anthropic.com") {
		opts = append(opts, option.WithBaseURL(cleanURL))
	}

	client := anthropic.NewClient(opts...)

	return &ClaudeClient{
		client:  &client,
		model:   anthropic.Model(model),
		baseURL: baseURL,
	}
}

// SetAPIKey updates the API key by recreating the client.
func (c *ClaudeClient) SetAPIKey(apiKey string) {
	opts := []option.RequestOption{
		option.WithAPIKey(apiKey),
	}

	cleanURL := strings.TrimRight(c.baseURL, "/")
	cleanURL = strings.TrimSuffix(cleanURL, "/v1/messages")
	cleanURL = strings.TrimSuffix(cleanURL, "/v1")
	cleanURL = strings.TrimRight(cleanURL, "/")

	if cleanURL != "" && !strings.Contains(cleanURL, "api.anthropic.com") {
		opts = append(opts, option.WithBaseURL(cleanURL))
	}

	client := anthropic.NewClient(opts...)
	c.client = &client
}

// ---------- streaming types ----------

type StreamEventType string

const (
	StreamEventStart    StreamEventType = "start"
	StreamEventChunk    StreamEventType = "chunk"
	StreamEventToolCall StreamEventType = "tool_call"
	StreamEventEnd      StreamEventType = "end"
	StreamEventError    StreamEventType = "error"
)

type StreamEvent struct {
	Type      StreamEventType        `json:"type"`
	MessageID string                 `json:"messageId"`
	Text      string                 `json:"text,omitempty"`
	ToolName  string                 `json:"toolName,omitempty"`
	ToolID    string                 `json:"toolId,omitempty"`
	ToolInput map[string]interface{} `json:"toolInput,omitempty"`
}

// ---------- tool definitions ----------

func chatTools() []anthropic.ToolUnionParam {
	return []anthropic.ToolUnionParam{
		{OfTool: &anthropic.ToolParam{
			Name:        "create_task",
			Description: anthropic.String("创建一个新任务"),
			InputSchema: anthropic.ToolInputSchemaParam{
				Properties: map[string]any{
					"title": map[string]any{
						"type":        "string",
						"description": "任务标题",
					},
					"projectId": map[string]any{
						"type":        "string",
						"description": "所属项目ID",
					},
					"priority": map[string]any{
						"type":        "integer",
						"description": "优先级，0=P0(紧急), 1=P1, 2=P2, 3=P3",
						"minimum":     0,
						"maximum":     3,
					},
					"dueDate": map[string]any{
						"type":        "string",
						"description": "截止日期，ISO格式（可选）",
					},
				},
				Required: []string{"title", "projectId"},
			},
		}},
		{OfTool: &anthropic.ToolParam{
			Name:        "update_task",
			Description: anthropic.String("更新已有任务"),
			InputSchema: anthropic.ToolInputSchemaParam{
				Properties: map[string]any{
					"id": map[string]any{
						"type":        "string",
						"description": "任务ID",
					},
					"title": map[string]any{
						"type":        "string",
						"description": "任务标题",
					},
					"status": map[string]any{
						"type":        "string",
						"description": "任务状态",
						"enum":        []string{"todo", "doing", "done"},
					},
					"priority": map[string]any{
						"type":        "integer",
						"description": "优先级，0-3",
					},
					"dueDate": map[string]any{
						"type":        "string",
						"description": "截止日期，ISO格式",
					},
				},
				Required: []string{"id"},
			},
		}},
		{OfTool: &anthropic.ToolParam{
			Name:        "list_tasks",
			Description: anthropic.String("查询任务列表"),
			InputSchema: anthropic.ToolInputSchemaParam{
				Properties: map[string]any{
					"projectId": map[string]any{
						"type":        "string",
						"description": "按项目ID过滤（可选）",
					},
					"status": map[string]any{
						"type":        "string",
						"description": "按状态过滤：todo/doing/done（可选）",
					},
				},
			},
		}},
		{OfTool: &anthropic.ToolParam{
			Name:        "delete_task",
			Description: anthropic.String("删除一个任务"),
			InputSchema: anthropic.ToolInputSchemaParam{
				Properties: map[string]any{
					"id": map[string]any{
						"type":        "string",
						"description": "要删除的任务ID",
					},
				},
				Required: []string{"id"},
			},
		}},
	}
}

// ---------- message conversion ----------

// convertMessages converts ChatMessage slices into SDK MessageParam slices.
func convertMessages(messages []ChatMessage) []anthropic.MessageParam {
	params := make([]anthropic.MessageParam, 0, len(messages))
	for _, m := range messages {
		params = append(params, convertOneMessage(m))
	}
	return params
}

func convertOneMessage(m ChatMessage) anthropic.MessageParam {
	if len(m.ContentBlocks) > 0 {
		blocks := make([]anthropic.ContentBlockParamUnion, 0, len(m.ContentBlocks))
		for _, b := range m.ContentBlocks {
			switch b.Type {
			case "text":
				blocks = append(blocks, anthropic.NewTextBlock(b.Text))
			case "tool_use":
				inputJSON, _ := json.Marshal(b.Input)
				blocks = append(blocks, anthropic.ContentBlockParamUnion{
					OfToolUse: &anthropic.ToolUseBlockParam{
						ID:    b.ID,
						Name:  b.Name,
						Input: json.RawMessage(inputJSON),
					},
				})
			case "tool_result":
				blocks = append(blocks, anthropic.NewToolResultBlock(b.ToolUseID, b.Content, false))
			}
		}
		if m.Role == "assistant" {
			return anthropic.NewAssistantMessage(blocks...)
		}
		return anthropic.NewUserMessage(blocks...)
	}

	// Simple text content
	if m.Role == "assistant" {
		return anthropic.NewAssistantMessage(anthropic.NewTextBlock(m.Content))
	}
	return anthropic.NewUserMessage(anthropic.NewTextBlock(m.Content))
}

// ---------- internal helpers ----------

// simpleRequest is a shared helper for non-tool, single-turn requests.
func (c *ClaudeClient) simpleRequest(systemPrompt, userMessage string, maxTokens int) (string, error) {
	logger.Log.Info("AI API request", "model", string(c.model), "baseURL", c.baseURL)

	params := anthropic.MessageNewParams{
		Model:     c.model,
		MaxTokens: int64(maxTokens),
		Messages: []anthropic.MessageParam{
			anthropic.NewUserMessage(anthropic.NewTextBlock(userMessage)),
		},
	}
	if systemPrompt != "" {
		params.System = []anthropic.TextBlockParam{{Text: systemPrompt}}
	}

	message, err := c.client.Messages.New(context.TODO(), params)
	if err != nil {
		logger.Log.Error("AI API error", "error", err)
		return "", fmt.Errorf("API error: %w", err)
	}

	var text string
	for _, block := range message.Content {
		if v, ok := block.AsAny().(anthropic.TextBlock); ok {
			text += v.Text
		}
	}

	logger.Log.Info("AI API response", "textLen", len(text))
	return text, nil
}

// extractResults extracts text and tool calls from an accumulated message.
func extractResults(message *anthropic.Message) (string, []ToolCall) {
	var text string
	var toolCalls []ToolCall

	for _, block := range message.Content {
		switch v := block.AsAny().(type) {
		case anthropic.TextBlock:
			text += v.Text
		case anthropic.ToolUseBlock:
			var input map[string]interface{}
			if err := json.Unmarshal([]byte(v.JSON.Input.Raw()), &input); err != nil {
				input = map[string]interface{}{}
			}
			toolCalls = append(toolCalls, ToolCall{
				ID:    v.ID,
				Name:  v.Name,
				Input: input,
			})
		}
	}

	return text, toolCalls
}

// ---------- public methods ----------

// Chat sends a conversation to Claude and returns the text reply and any tool calls.
func (c *ClaudeClient) Chat(messages []ChatMessage, taskContext string) (string, []ToolCall, error) {
	systemPrompt := "你是 TaskPilot AI 助手，帮助用户管理项目和任务。用户的任务数据会作为上下文提供。你可以使用工具来创建、更新、查询、删除任务。请用中文回复。"
	if taskContext != "" {
		systemPrompt += "\n\n当前任务数据（JSON格式）：\n" + taskContext
	}

	logger.Log.Info("AI API request", "model", string(c.model), "baseURL", c.baseURL, "messages", len(messages))

	params := anthropic.MessageNewParams{
		Model:     c.model,
		MaxTokens: int64(4096),
		System:    []anthropic.TextBlockParam{{Text: systemPrompt}},
		Messages:  convertMessages(messages),
		Tools:     chatTools(),
	}

	message, err := c.client.Messages.New(context.TODO(), params)
	if err != nil {
		logger.Log.Error("AI API error", "error", err)
		return "", nil, fmt.Errorf("API error: %w", err)
	}

	text, toolCalls := extractResults(message)

	logger.Log.Info("AI API response", "textLen", len(text), "toolCalls", len(toolCalls))
	return text, toolCalls, nil
}

// ChatStream sends a conversation to Claude using streaming and calls onEvent for each event.
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

	logger.Log.Info("AI streaming request", "model", string(c.model), "baseURL", c.baseURL, "messages", len(messages))

	params := anthropic.MessageNewParams{
		Model:     c.model,
		MaxTokens: int64(4096),
		System:    []anthropic.TextBlockParam{{Text: systemPrompt}},
		Messages:  convertMessages(messages),
		Tools:     chatTools(),
	}

	stream := c.client.Messages.NewStreaming(context.TODO(), params)
	message := anthropic.Message{}

	var messageID string

	for stream.Next() {
		event := stream.Current()
		message.Accumulate(event)

		switch ev := event.AsAny().(type) {
		case anthropic.MessageStartEvent:
			messageID = ev.Message.ID
			onEvent(StreamEvent{
				Type:      StreamEventStart,
				MessageID: messageID,
			})

		case anthropic.ContentBlockStartEvent:
			// If it's a tool_use block, we note it but don't emit yet;
			// we'll emit StreamEventToolCall at content_block_stop via extractResults.

		case anthropic.ContentBlockDeltaEvent:
			switch delta := ev.Delta.AsAny().(type) {
			case anthropic.TextDelta:
				onEvent(StreamEvent{
					Type:      StreamEventChunk,
					MessageID: messageID,
					Text:      delta.Text,
				})
			case anthropic.InputJSONDelta:
				// Tool input accumulates via message.Accumulate; nothing to emit.
				_ = delta
			}

		case anthropic.ContentBlockStopEvent:
			// Check if the just-finished block is a tool_use block.
			idx := ev.Index
			if int(idx) < len(message.Content) {
				block := message.Content[idx]
				if v, ok := block.AsAny().(anthropic.ToolUseBlock); ok {
					var input map[string]interface{}
					if err := json.Unmarshal([]byte(v.JSON.Input.Raw()), &input); err != nil {
						input = map[string]interface{}{}
					}
					onEvent(StreamEvent{
						Type:      StreamEventToolCall,
						MessageID: messageID,
						ToolName:  v.Name,
						ToolID:    v.ID,
						ToolInput: input,
					})
				}
			}

		case anthropic.MessageStopEvent:
			onEvent(StreamEvent{
				Type:      StreamEventEnd,
				MessageID: messageID,
			})
		}
	}

	if stream.Err() != nil {
		logger.Log.Error("AI streaming error", "error", stream.Err())
		return "", nil, fmt.Errorf("streaming error: %w", stream.Err())
	}

	text, toolCalls := extractResults(&message)

	logger.Log.Info("AI streaming completed", "textLen", len(text), "toolCalls", len(toolCalls))
	return text, toolCalls, nil
}

// ---------- high-level methods ----------

// GenerateDailySummary generates a Markdown daily summary from a list of tasks.
func (c *ClaudeClient) GenerateDailySummary(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	userContent := "请根据以下任务数据生成一份简洁的每日工作摘要。包括：已完成的工作、进行中的工作、待处理的紧急事项。用中文回复，格式清晰。\n\n任务数据：\n" + string(taskJSON)
	return c.simpleRequest("", userContent, 2048)
}

// SmartSuggest analyzes existing tasks and suggests new tasks.
func (c *ClaudeClient) SmartSuggest(tasks []map[string]interface{}, projectName string) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`基于以下项目「%s」的现有任务，分析项目进展并智能推荐 3-5 个可能需要添加的新任务。

对每个建议的任务，请提供：
- **标题**：简洁明确的任务标题
- **优先级**：P0-P3
- **理由**：为什么建议这个任务

请用中文回复，格式清晰。

现有任务数据：
%s`, projectName, string(taskJSON))

	return c.simpleRequest("", prompt, 2048)
}

// DecomposeTask breaks down a complex task into subtasks.
func (c *ClaudeClient) DecomposeTask(taskTitle, taskDescription string, contextTasks []map[string]interface{}) (string, error) {
	contextJSON, _ := json.MarshalIndent(contextTasks, "", "  ")

	prompt := fmt.Sprintf(`请将以下任务分解为可执行的子任务（3-7 个）。

**任务标题**：%s
**任务描述**：%s

每个子任务需要：
- **标题**：明确可执行的描述
- **优先级**：P0-P3
- **预估时间**：大致时间估算
- **依赖关系**：是否依赖其他子任务

请用中文回复。

项目现有任务上下文：
%s`, taskTitle, taskDescription, string(contextJSON))

	return c.simpleRequest("", prompt, 2048)
}

// PrioritizeTasks analyzes and suggests priority adjustments.
func (c *ClaudeClient) PrioritizeTasks(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`请分析以下任务列表，并给出优先级调整建议。

考虑因素：
1. 截止日期紧迫程度
2. 任务之间的依赖关系
3. 当前进行中任务的数量（建议同时进行不超过 3 个）
4. 优先处理阻塞其他任务的工作

对于每个需要调整的任务，说明：
- 当前优先级 → 建议优先级
- 调整理由

最后给出一个建议的任务执行顺序。请用中文回复。

任务数据：
%s`, string(taskJSON))

	return c.simpleRequest("", prompt, 2048)
}

// GenerateWeeklyReport generates a weekly progress report.
func (c *ClaudeClient) GenerateWeeklyReport(tasks []map[string]interface{}) (string, error) {
	taskJSON, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal tasks: %w", err)
	}

	prompt := fmt.Sprintf(`请根据以下任务数据生成一份周报。包括：

## 本周完成
列出已完成的任务及成果

## 进行中的工作
列出进行中的任务及当前状态

## 下周计划
根据待办任务和优先级，建议下周的工作重点

## 风险与阻塞
识别可能的风险和阻塞项

## 数据统计
- 完成率
- 各优先级任务分布
- 逾期任务数量

请用中文回复，格式专业简洁。

任务数据：
%s`, string(taskJSON))

	return c.simpleRequest("", prompt, 3000)
}

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

	return c.simpleRequest("", prompt, 512)
}

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

	text, err := c.simpleRequest("", prompt, 64)
	if err != nil {
		return nil, err
	}

	text = strings.TrimSpace(text)
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

// TestConnection tests if the API configuration is working.
func (c *ClaudeClient) TestConnection() error {
	_, err := c.simpleRequest("", "Hi", 16)
	return err
}
